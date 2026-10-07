const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const mongoose = require("mongoose");
const ScrapedJob = require("../models/ScrapedJob");
const ScrapeRun = require("../models/ScrapeRun");
const { sources, sourceTemplate } = require("../config/scraperSources");
const { getAdapter } = require("../services/scraper/adapters");
const { normalizeJob, normalizeWorkMode } = require("../services/scraper/normalize");
const {
  validateNormalizedJob,
  validateSourceConfig,
  validateSourceUrl,
} = require("../services/scraper/validate");
const { upsertScrapedJob } = require("../services/scraper/upsert");
const { createScraperOrchestrator } = require("../services/scraper/orchestrator");
const { startScheduler, stopScheduler } = require("../services/scraper/scheduler");
const { createSourceRequester } = require("../services/scraper/adapters/request");

const source = {
  name: "test-source",
  enabled: true,
  baseUrl: "https://jobs.example.com/api",
  allowedHosts: ["jobs.example.com"],
  requestTimeoutMs: 10000,
  maxRequestsPerMinute: 600,
  maxConcurrency: 1,
  intervalMinutes: 60,
  adapterName: "test-adapter",
  maxRetries: 1,
  maxRetryAfterMs: 30000,
  maxJobsPerRun: 500,
};

const publicLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

const normalizedRecord = (overrides = {}) =>
  normalizeJob({
    sourceJobId: "vendor-001",
    title: "Software Engineer",
    companyName: "Example Company",
    description: "Build useful software.",
    responsibilities: ["Build services"],
    requirements: ["Experience with Node.js"],
    skillsRequired: ["Node.js", "MongoDB"],
    location: "Remote",
    workMode: "Remote",
    employmentType: "Full-time",
    salary: "",
    sourceUrl: "https://jobs.example.com/jobs/vendor-001",
    postedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: null,
    ...overrides,
  });

const createMemoryJobModel = () => {
  const records = [];
  return {
    records,
    findOne: async (identity) =>
      records.find(
        (record) =>
          record.source === identity.source &&
          (identity.sourceJobId
            ? record.sourceJobId === identity.sourceJobId
            : record.sourceJobId == null && record.sourceUrl === identity.sourceUrl)
      ) || null,
    create: async (record) => {
      const document = {
        ...record,
        save: async () => {},
      };
      records.push(document);
      return document;
    },
    updateMany: async (filter, update) => {
      let modifiedCount = 0;
      for (const record of records) {
        if (record.source !== filter.source || record.status !== filter.status) {
          continue;
        }
        const matchesFilter = filter.sourceJobId
          ? typeof record.sourceJobId === "string" &&
            !filter.sourceJobId.$nin.includes(record.sourceJobId)
          : record.expiresAt instanceof Date &&
            record.expiresAt <= filter.expiresAt.$lte;
        if (!matchesFilter) continue;
        record.status = update.$set.status;
        modifiedCount += 1;
      }
      return { modifiedCount };
    },
  };
};

const createMemoryRunModel = () => {
  const records = [];
  return {
    records,
    create: async (record) => {
      const document = {
        ...record,
        save: async () => {},
      };
      records.push(document);
      return document;
    },
  };
};

test("scraped-job schema declares external identity, fallback, and expiry indexes", () => {
  const indexes = ScrapedJob.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.source === 1 &&
    keys.sourceJobId === 1 &&
    options.unique === true &&
    options.partialFilterExpression.sourceJobId.$type === "string"
  ));
  assert.ok(indexes.some(([keys, options]) =>
    keys.source === 1 &&
    keys.sourceUrl === 1 &&
    options.unique === true &&
    options.partialFilterExpression.sourceJobId === null
  ));
  assert.ok(indexes.some(([keys]) =>
    keys.source === 1 && keys.status === 1 && keys.expiresAt === 1
  ));
  assert.equal(ScrapedJob.schema.path("companyId"), undefined);
  assert.equal(ScrapedJob.schema.path("sourceJobId").options.default, null);
});

test("scrape-run schema stores bounded sanitized run summaries", () => {
  assert.ok(ScrapeRun.schema.path("durationMs"));
  assert.ok(ScrapeRun.schema.path("errorSummaries"));
  assert.equal(ScrapeRun.schema.path("status").enumValues.includes("running"), true);
  assert.equal(ScrapeRun.schema.path("rawHtml"), undefined);
});

test("Greenhouse source is registered, valid, and intentionally enabled", () => {
  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, "discord");
  assert.equal(sources[0].enabled, true);
  assert.equal(sources[0].adapterName, "greenhouse");
  assert.deepEqual(sources[0].allowedHosts, [
    "boards-api.greenhouse.io",
    "job-boards.greenhouse.io",
  ]);
  assert.equal(validateSourceConfig(sources[0]).valid, true);
  assert.equal(typeof getAdapter("greenhouse")?.fetchJobs, "function");
  assert.equal(sourceTemplate.enabled, false);
  for (const field of [
    "name",
    "baseUrl",
    "allowedHosts",
    "requestTimeoutMs",
    "maxRequestsPerMinute",
    "maxConcurrency",
    "intervalMinutes",
    "adapterName",
  ]) {
    assert.ok(Object.hasOwn(sourceTemplate, field));
  }
});

test("Greenhouse adapter maps public-board jobs using the mocked request helper", async () => {
  const greenhouse = getAdapter("greenhouse");
  const requestUrl = sources[0].baseUrl;
  let requestedSource;
  let requestedUrl;
  const records = await greenhouse.fetchJobs(sources[0], {
    requestJson: async (sourceConfig, url) => {
      requestedSource = sourceConfig;
      requestedUrl = url;
      return {
        jobs: [
          {
            id: 12345,
            title: "Software Engineer",
            company_name: "Discord",
            content: "<p>Build useful software.</p>",
            location: { name: "San Francisco" },
            absolute_url: "https://job-boards.greenhouse.io/discord/jobs/12345",
            first_published: "2026-09-15T12:52:11-04:00",
            updated_at: "2026-10-02T14:24:13-04:00",
            application_deadline: "2026-12-31T23:59:59Z",
          },
        ],
      };
    },
  });

  assert.equal(requestedSource, sources[0]);
  assert.equal(requestedUrl, requestUrl);
  assert.deepEqual(records, [
    {
      sourceJobId: "12345",
      title: "Software Engineer",
      companyName: "Discord",
      description: "<p>Build useful software.</p>",
      responsibilities: [],
      requirements: [],
      skillsRequired: [],
      location: "San Francisco",
      workMode: null,
      employmentType: "",
      salary: "",
      sourceUrl: "https://job-boards.greenhouse.io/discord/jobs/12345",
      postedAt: "2026-09-15T12:52:11-04:00",
      expiresAt: "2026-12-31T23:59:59Z",
    },
  ]);

  const normalized = normalizeJob(records[0]);
  const validation = await validateNormalizedJob(
    normalized,
    sources[0],
    publicLookup
  );
  assert.equal(validation.valid, true);
  assert.equal(validation.record.source, "discord");
  assert.equal(validation.record.sourceJobId, "12345");
});

test("Greenhouse adapter rejects malformed job-board responses", async () => {
  await assert.rejects(
    getAdapter("greenhouse").fetchJobs(sources[0], {
      requestJson: async () => ({ jobs: null }),
    }),
    /invalid jobs response/
  );
});

test("normalization cleans text without fabricating missing values", () => {
  const record = normalizeJob({
    title: "  Senior   Software\nEngineer ",
    companyName: " Example   Corp ",
    location: " Remote   / US ",
    description: "  First line  \r\n\r\n\r\nSecond line ",
    skillsRequired: [" Node.js ", "", "Node.js", "MongoDB"],
    workMode: "Work from home",
  });
  assert.equal(record.title, "Senior Software Engineer");
  assert.equal(record.companyName, "Example Corp");
  assert.equal(record.location, "Remote / US");
  assert.equal(record.description, "First line\n\nSecond line");
  assert.deepEqual(record.skillsRequired, ["Node.js", "MongoDB"]);
  assert.equal(record.workMode, "remote");
  assert.equal(normalizeWorkMode("flexible location"), null);
  assert.equal(normalizeJob({}).title, "");
});

test("validation enforces HTTPS allowlist and rejects local/private destinations", async () => {
  assert.equal(validateSourceConfig(source).valid, true);
  const valid = await validateNormalizedJob(
    normalizedRecord(),
    source,
    publicLookup
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.record.source, source.name);
  assert.equal(valid.record.sourceJobId, "vendor-001");

  const offHost = await validateSourceUrl(
    "https://other.example.net/jobs/1",
    source,
    publicLookup
  );
  assert.equal(offHost.valid, false);
  assert.equal(offHost.code, "SOURCE_URL_NOT_ALLOWED");

  const privateDns = await validateSourceUrl(
    "https://jobs.example.com/jobs/1",
    source,
    async () => [{ address: "10.0.0.5", family: 4 }]
  );
  assert.equal(privateDns.valid, false);
  assert.equal(privateDns.code, "SOURCE_HOST_NOT_PUBLIC");

  const localUrl = await validateSourceUrl("https://localhost/jobs/1", source);
  assert.equal(localUrl.valid, false);
  assert.equal(validateSourceConfig({ ...source, baseUrl: "http://jobs.example.com" }).valid, false);
});

test("malformed records are rejected independently", async () => {
  const missingFields = await validateNormalizedJob(
    normalizeJob({ sourceUrl: "https://jobs.example.com/jobs/1" }),
    source,
    publicLookup
  );
  assert.deepEqual(missingFields, {
    valid: false,
    code: "REQUIRED_JOB_FIELDS_MISSING",
  });

  const invalidDate = await validateNormalizedJob(
    normalizeJob({
      title: "Role",
      companyName: "Company",
      sourceUrl: "https://jobs.example.com/jobs/1",
      postedAt: "not a date",
    }),
    source,
    publicLookup
  );
  assert.equal(invalidDate.valid, false);
  assert.equal(invalidDate.code, "INVALID_JOB_DATE");
});

test("request helper enforces the allowlist, bounded retry, and Retry-After", async () => {
  const delays = [];
  const responses = [
    { status: 429, headers: { "retry-after": "2" } },
    { status: 200, data: [{ id: "1" }] },
  ];
  const requester = createSourceRequester({
    lookup: publicLookup,
    sleep: async (milliseconds) => delays.push(milliseconds),
    now: () => 1000,
    httpClient: {
      request: async (options) => {
        assert.equal(options.timeout, source.requestTimeoutMs);
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.maxContentLength, 2 * 1024 * 1024);
        assert.equal(typeof options.lookup, "function");
        return responses.shift();
      },
    },
  });
  const result = await requester(source, "https://jobs.example.com/api/jobs");
  assert.deepEqual(result, [{ id: "1" }]);
  assert.deepEqual(delays, [2000]);
});

test("scheduler does not start without enabled sources", () => {
  let invoked = false;
  const result = startScheduler({
    sources: [],
    connection: { readyState: 1 },
    run: () => {
      invoked = true;
    },
  });
  assert.deepEqual(result, { started: false, reason: "no_enabled_sources" });
  assert.equal(invoked, false);
  stopScheduler();
});

test("upsert is idempotent, updates source-owned fields, and supports URL identity", async () => {
  const model = createMemoryJobModel();
  const firstSeenAt = new Date("2026-10-07T00:00:00.000Z");
  const valid = await validateNormalizedJob(normalizedRecord(), source, publicLookup);

  assert.equal(
    (await upsertScrapedJob(valid.record, { model, now: firstSeenAt })).outcome,
    "inserted"
  );
  assert.equal(
    (await upsertScrapedJob(valid.record, {
      model,
      now: new Date(firstSeenAt.getTime() + 1000),
    })).outcome,
    "skipped"
  );

  const changed = await validateNormalizedJob(
    normalizedRecord({ title: "Senior Software Engineer" }),
    source,
    publicLookup
  );
  assert.equal(
    (await upsertScrapedJob(changed.record, {
      model,
      now: new Date(firstSeenAt.getTime() + 2000),
    })).outcome,
    "updated"
  );
  assert.equal(model.records[0].title, "Senior Software Engineer");
  assert.equal(model.records[0].firstSeenAt.getTime(), firstSeenAt.getTime());
  assert.equal(model.records[0].lastSeenAt.getTime(), firstSeenAt.getTime() + 2000);

  const fallback = await validateNormalizedJob(
    normalizedRecord({
      sourceJobId: "",
      sourceUrl: "https://jobs.example.com/jobs/fallback",
    }),
    source,
    publicLookup
  );
  assert.equal(
    (await upsertScrapedJob(fallback.record, { model, now: firstSeenAt })).outcome,
    "inserted"
  );
  assert.equal(
    (await upsertScrapedJob(fallback.record, {
      model,
      now: new Date(firstSeenAt.getTime() + 1000),
    })).outcome,
    "skipped"
  );
  assert.equal(model.records.length, 2);
});

test("orchestrator isolates malformed records and sanitizes source failures", async () => {
  const jobModel = createMemoryJobModel();
  const runModel = createMemoryRunModel();
  const mixedResult = createScraperOrchestrator({
    sources: [source],
    getSourceAdapter: () => ({
      fetchJobs: async () => [normalizedRecord(), {}],
    }),
    ScrapedJobModel: jobModel,
    ScrapeRunModel: runModel,
    lookup: publicLookup,
  });

  const partialRun = await mixedResult.runSources();
  assert.equal(partialRun.status, "partial");
  assert.equal(partialRun.runs[0].insertedCount, 1);
  assert.equal(partialRun.runs[0].skippedCount, 1);
  assert.equal(partialRun.runs[0].fetchedCount, 2);

  const failureText = "sensitive external response details";
  const failedResult = createScraperOrchestrator({
    sources: [source],
    getSourceAdapter: () => ({
      fetchJobs: async () => {
        throw new Error(failureText);
      },
    }),
    ScrapeRunModel: runModel,
  });
  const failedRun = await failedResult.runSources();
  assert.equal(failedRun.status, "failed");
  assert.equal(failedRun.runs[0].failedCount, 1);
  assert.equal(JSON.stringify(failedRun.runs[0].errorSummaries).includes(failureText), false);
});

test("successful Greenhouse sync closes missing jobs and keeps returned jobs active", async () => {
  const model = createMemoryJobModel();
  const greenhouseSource = { ...source, adapterName: "greenhouse" };
  for (const record of [
    normalizedRecord({ sourceJobId: "returned-job" }),
    normalizedRecord({
      sourceJobId: "missing-job",
      sourceUrl: "https://jobs.example.com/jobs/missing-job",
    }),
  ]) {
    const validation = await validateNormalizedJob(
      record,
      greenhouseSource,
      publicLookup
    );
    await upsertScrapedJob(validation.record, { model });
  }
  const unrelated = await validateNormalizedJob(
    normalizedRecord({ sourceJobId: "other-source-job" }),
    greenhouseSource,
    publicLookup
  );
  await upsertScrapedJob(
    { ...unrelated.record, source: "another-source" },
    { model }
  );

  const orchestrator = createScraperOrchestrator({
    sources: [greenhouseSource],
    getSourceAdapter: () => ({
      fetchJobs: async () => [normalizedRecord({ sourceJobId: "returned-job" })],
    }),
    ScrapedJobModel: model,
    ScrapeRunModel: createMemoryRunModel(),
    lookup: publicLookup,
  });
  const result = await orchestrator.runSources();

  assert.equal(result.runs[0].status, "completed");
  assert.equal(
    model.records.find((record) => record.sourceJobId === "returned-job").status,
    "active"
  );
  assert.equal(
    model.records.find((record) => record.sourceJobId === "missing-job").status,
    "closed"
  );
  assert.equal(
    model.records.find((record) => record.source === "another-source").status,
    "active"
  );
});

test("failed Greenhouse provider request leaves existing jobs active", async () => {
  const model = createMemoryJobModel();
  const greenhouseSource = { ...source, adapterName: "greenhouse" };
  const existing = await validateNormalizedJob(
    normalizedRecord({ sourceJobId: "existing-job" }),
    greenhouseSource,
    publicLookup
  );
  await upsertScrapedJob(existing.record, { model });

  const orchestrator = createScraperOrchestrator({
    sources: [greenhouseSource],
    getSourceAdapter: () => ({
      fetchJobs: async () => {
        throw new Error("provider unavailable");
      },
    }),
    ScrapedJobModel: model,
    ScrapeRunModel: createMemoryRunModel(),
    lookup: publicLookup,
  });
  const result = await orchestrator.runSources();

  assert.equal(result.runs[0].status, "failed");
  assert.equal(
    model.records.find((record) => record.sourceJobId === "existing-job").status,
    "active"
  );
});

test("partial Greenhouse response does not close jobs missing from its valid records", async () => {
  const model = createMemoryJobModel();
  const greenhouseSource = { ...source, adapterName: "greenhouse" };
  for (const sourceJobId of ["returned-job", "missing-job"]) {
    const validation = await validateNormalizedJob(
      normalizedRecord({
        sourceJobId,
        sourceUrl: `https://jobs.example.com/jobs/${sourceJobId}`,
      }),
      greenhouseSource,
      publicLookup
    );
    await upsertScrapedJob(validation.record, { model });
  }
  const orchestrator = createScraperOrchestrator({
    sources: [greenhouseSource],
    getSourceAdapter: () => ({
      fetchJobs: async () => [
        normalizedRecord({ sourceJobId: "returned-job" }),
        {},
      ],
    }),
    ScrapedJobModel: model,
    ScrapeRunModel: createMemoryRunModel(),
    lookup: publicLookup,
  });

  const result = await orchestrator.runSources();

  assert.equal(result.runs[0].status, "partial");
  assert.equal(
    model.records.find((record) => record.sourceJobId === "missing-job").status,
    "active"
  );
});

test("repeated successful Greenhouse sync keeps stale-job reconciliation idempotent", async () => {
  const model = createMemoryJobModel();
  const greenhouseSource = { ...source, adapterName: "greenhouse" };
  for (const sourceJobId of ["returned-job", "missing-job"]) {
    const validation = await validateNormalizedJob(
      normalizedRecord({
        sourceJobId,
        sourceUrl: `https://jobs.example.com/jobs/${sourceJobId}`,
      }),
      greenhouseSource,
      publicLookup
    );
    await upsertScrapedJob(validation.record, { model });
  }
  const orchestrator = createScraperOrchestrator({
    sources: [greenhouseSource],
    getSourceAdapter: () => ({
      fetchJobs: async () => [
        normalizedRecord({ sourceJobId: "returned-job" }),
      ],
    }),
    ScrapedJobModel: model,
    ScrapeRunModel: createMemoryRunModel(),
    lookup: publicLookup,
  });

  const firstRun = await orchestrator.runSources();
  const secondRun = await orchestrator.runSources();

  assert.equal(firstRun.runs[0].status, "completed");
  assert.equal(secondRun.runs[0].status, "completed");
  assert.equal(model.records.length, 2);
  assert.equal(
    model.records.find((record) => record.sourceJobId === "missing-job").status,
    "closed"
  );
  assert.equal(
    model.records.find((record) => record.sourceJobId === "returned-job").status,
    "active"
  );
});

test("Greenhouse reconciliation preserves explicit expiration status", async () => {
  const model = createMemoryJobModel();
  const greenhouseSource = { ...source, adapterName: "greenhouse" };
  for (const sourceJobId of ["expiring-job", "missing-job"]) {
    const validation = await validateNormalizedJob(
      normalizedRecord({
        sourceJobId,
        sourceUrl: `https://jobs.example.com/jobs/${sourceJobId}`,
      }),
      greenhouseSource,
      publicLookup
    );
    await upsertScrapedJob(validation.record, { model });
  }
  const expiredRecord = normalizedRecord({
    sourceJobId: "expiring-job",
    expiresAt: "2026-10-01T00:00:00.000Z",
  });
  const orchestrator = createScraperOrchestrator({
    sources: [greenhouseSource],
    getSourceAdapter: () => ({ fetchJobs: async () => [expiredRecord] }),
    ScrapedJobModel: model,
    ScrapeRunModel: createMemoryRunModel(),
    lookup: publicLookup,
    now: () => new Date("2026-10-07T00:00:00.000Z"),
  });

  const result = await orchestrator.runSources();

  assert.equal(result.runs[0].expiredCount, 1);
  assert.equal(
    model.records.find((record) => record.sourceJobId === "expiring-job").status,
    "expired"
  );
  assert.equal(
    model.records.find((record) => record.sourceJobId === "missing-job").status,
    "closed"
  );
});

test("Mongo-backed upsert and source-failure checks", {
  skip: !process.env.SCRAPER_TEST_MONGO_URI,
}, async (t) => {
  const databaseName = `hirehub_scraper_test_${Date.now().toString(36)}_${process.pid}`;
  await mongoose.connect(process.env.SCRAPER_TEST_MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000,
  });
  t.after(async () => {
    stopScheduler();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });

  await ScrapedJob.init();
  await ScrapeRun.init();

  const fixedNow = new Date("2026-10-07T00:00:00.000Z");
  const validRecord = await validateNormalizedJob(
    normalizedRecord(),
    source,
    publicLookup
  );
  const inserted = await upsertScrapedJob(validRecord.record, {
    now: fixedNow,
  });
  const skipped = await upsertScrapedJob(validRecord.record, {
    now: new Date(fixedNow.getTime() + 1000),
  });
  assert.equal(inserted.outcome, "inserted");
  assert.equal(skipped.outcome, "skipped");

  const changedRecord = await validateNormalizedJob(
    normalizedRecord({ title: "Senior Software Engineer" }),
    source,
    publicLookup
  );
  const updated = await upsertScrapedJob(changedRecord.record, {
    now: new Date(fixedNow.getTime() + 2000),
  });
  assert.equal(updated.outcome, "updated");
  const stored = await ScrapedJob.findOne({
    source: source.name,
    sourceJobId: "vendor-001",
  });
  assert.equal(stored.title, "Senior Software Engineer");
  assert.equal(stored.firstSeenAt.getTime(), fixedNow.getTime());
  assert.equal(stored.lastSeenAt.getTime(), fixedNow.getTime() + 2000);
  assert.equal(await ScrapedJob.countDocuments({ source: source.name }), 1);

  const fallbackRecord = await validateNormalizedJob(
    normalizedRecord({
      sourceJobId: "",
      sourceUrl: "https://jobs.example.com/jobs/fallback",
    }),
    source,
    publicLookup
  );
  assert.equal((await upsertScrapedJob(fallbackRecord.record, { now: fixedNow })).outcome, "inserted");
  assert.equal((await upsertScrapedJob(fallbackRecord.record, {
    now: new Date(fixedNow.getTime() + 1000),
  })).outcome, "skipped");

  const expiredRecord = await validateNormalizedJob(
    normalizedRecord({
      sourceJobId: "vendor-expired",
      sourceUrl: "https://jobs.example.com/jobs/vendor-expired",
      expiresAt: "2026-10-01T00:00:00.000Z",
    }),
    source,
    publicLookup
  );
  assert.equal((await upsertScrapedJob(expiredRecord.record, { now: fixedNow })).outcome, "inserted");
  assert.equal(
    (await ScrapedJob.findOne({ sourceJobId: "vendor-expired" })).status,
    "expired"
  );

  const secretLikeError = "response included sensitive untrusted details";
  const orchestrator = createScraperOrchestrator({
    sources: [source],
    ScrapedJobModel: ScrapedJob,
    ScrapeRunModel: ScrapeRun,
    getSourceAdapter: () => ({
      fetchJobs: async () => {
        throw new Error(secretLikeError);
      },
    }),
  });
  const runResult = await orchestrator.runSources();
  assert.equal(runResult.status, "failed");
  assert.equal(runResult.runs[0].status, "failed");
  assert.equal(runResult.runs[0].failedCount, 1);
  assert.equal(
    JSON.stringify(runResult.runs[0].errorSummaries).includes(secretLikeError),
    false
  );
});

after(() => {
  stopScheduler();
});
