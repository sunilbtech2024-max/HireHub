const ScrapeRun = require("../../models/ScrapeRun");
const ScrapedJob = require("../../models/ScrapedJob");
const { sources: configuredSources } = require("../../config/scraperSources");
const { getAdapter } = require("./adapters");
const { normalizeJob } = require("./normalize");
const { validateNormalizedJob, validateSourceConfig } = require("./validate");
const {
  closeMissingJobs,
  expireDueJobs,
  upsertScrapedJob,
} = require("./upsert");

const maxErrorSummaries = 20;
const safeErrorMessage = (code) => {
  const messages = {
    INVALID_SOURCE_CONFIGURATION: "Source configuration is invalid.",
    ADAPTER_NOT_REGISTERED: "No adapter is registered for this source.",
    ADAPTER_FAILED: "The source adapter failed.",
    INVALID_ADAPTER_RESPONSE: "The source adapter returned an invalid result.",
    TOO_MANY_RECORDS: "The source returned more records than the configured limit.",
    REQUIRED_JOB_FIELDS_MISSING: "A record is missing required job fields.",
    SOURCE_URL_REQUIRED: "A record is missing its source URL.",
    INVALID_SOURCE_URL: "A record contains an invalid source URL.",
    SOURCE_URL_NOT_ALLOWED: "A record URL is outside the configured HTTPS host allowlist.",
    SOURCE_HOST_NOT_PUBLIC: "A source URL resolved to a private or reserved address.",
    SOURCE_HOST_UNRESOLVABLE: "A source URL host could not be resolved.",
    INVALID_JOB_DATE: "A record contains an invalid date.",
    INVALID_RECORD: "A source record has an invalid structure.",
    RECORD_UPSERT_FAILED: "A validated record could not be stored.",
  };
  return messages[code] || "The source record could not be processed.";
};

const createScraperOrchestrator = ({
  sources = configuredSources,
  getSourceAdapter = getAdapter,
  ScrapedJobModel = ScrapedJob,
  ScrapeRunModel = ScrapeRun,
  lookup,
  now = () => new Date(),
} = {}) => {
  let runInProgress = false;

  const runSource = async (source) => {
    const startedAt = now();
    const run = await ScrapeRunModel.create({
      source: source?.name || "unknown",
      startedAt,
      status: "running",
    });
    const errors = [];
    const counts = {
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      expiredCount: 0,
      failedCount: 0,
    };

    const addError = (code) => {
      if (errors.length < maxErrorSummaries) {
        errors.push({ code, message: safeErrorMessage(code) });
      }
    };

    const finish = async (status) => {
      const finishedAt = now();
      Object.assign(run, counts, {
        errorSummaries: errors,
        finishedAt,
        status,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      });
      await run.save();
      return run;
    };

    const configResult = validateSourceConfig(source);
    if (!configResult.valid) {
      counts.failedCount += 1;
      addError(configResult.code);
      return finish("failed");
    }

    const adapter = getSourceAdapter(source.adapterName);
    if (!adapter) {
      counts.failedCount += 1;
      addError("ADAPTER_NOT_REGISTERED");
      return finish("failed");
    }

    let records;
    try {
      records = await adapter.fetchJobs(configResult.source, {
        requestJson: require("./adapters/request").requestJson,
      });
    } catch {
      counts.failedCount += 1;
      addError("ADAPTER_FAILED");
      return finish("failed");
    }

    if (!Array.isArray(records)) {
      counts.failedCount += 1;
      addError("INVALID_ADAPTER_RESPONSE");
      return finish("failed");
    }
    if (records.length > source.maxJobsPerRun) {
      counts.failedCount += 1;
      addError("TOO_MANY_RECORDS");
      return finish("failed");
    }

    const allRecordsHaveSourceJobIds = records.every(
      (record) =>
        typeof record?.sourceJobId === "string" &&
        record.sourceJobId.trim().length > 0
    );
    const successfulSourceJobIds = new Set();
    let successfulRecordCount = 0;
    let hasInvalidRecords = false;

    for (const rawRecord of records) {
      counts.fetchedCount += 1;
      let validation;
      try {
        validation = await validateNormalizedJob(
          normalizeJob(rawRecord),
          configResult.source,
          lookup
        );
      } catch {
        counts.failedCount += 1;
        hasInvalidRecords = true;
        addError("INVALID_RECORD");
        continue;
      }
      if (!validation.valid) {
        counts.skippedCount += 1;
        hasInvalidRecords = true;
        addError(validation.code);
        continue;
      }

      try {
        const result = await upsertScrapedJob(validation.record, {
          model: ScrapedJobModel,
          now: now(),
        });
        counts[`${result.outcome}Count`] += 1;
        successfulRecordCount += 1;
        if (validation.record.sourceJobId) {
          successfulSourceJobIds.add(validation.record.sourceJobId);
        }
      } catch {
        counts.failedCount += 1;
        addError("RECORD_UPSERT_FAILED");
      }
    }

    try {
      counts.expiredCount += await expireDueJobs(source.name, {
        model: ScrapedJobModel,
        now: now(),
      });
    } catch {
      counts.failedCount += 1;
      addError("RECORD_UPSERT_FAILED");
    }

    if (
      source.adapterName === "greenhouse" &&
      allRecordsHaveSourceJobIds &&
      counts.failedCount === 0 &&
      !hasInvalidRecords
    ) {
      try {
        await closeMissingJobs(source.name, [...successfulSourceJobIds], {
          model: ScrapedJobModel,
        });
      } catch {
        counts.failedCount += 1;
        addError("RECORD_UPSERT_FAILED");
      }
    }

    const hadRecordErrors = counts.failedCount > 0 || hasInvalidRecords;
    const status = hadRecordErrors
      ? successfulRecordCount > 0 ? "partial" : "failed"
      : "completed";
    return finish(status);
  };

  const runSources = async (sourcesToRun = sources) => {
    if (runInProgress) {
      return { status: "skipped", reason: "run_in_progress", runs: [] };
    }

    const enabledSources = sourcesToRun.filter((source) => source?.enabled === true);
    if (!enabledSources.length) {
      return { status: "skipped", reason: "no_enabled_sources", runs: [] };
    }

    runInProgress = true;
    try {
      const runs = [];
      for (const source of enabledSources) {
        runs.push(await runSource(source));
      }
      const failedCount = runs.filter((run) => run.status === "failed").length;
      const hasPartialRuns = runs.some((run) => run.status === "partial");
      const status =
        failedCount === runs.length
          ? "failed"
          : failedCount > 0 || hasPartialRuns
            ? "partial"
            : "completed";
      return { status, runs };
    } finally {
      runInProgress = false;
    }
  };

  return { runSources, runSource, isRunning: () => runInProgress };
};

const scraperOrchestrator = createScraperOrchestrator();

module.exports = {
  createScraperOrchestrator,
  runSources: scraperOrchestrator.runSources,
  runSource: scraperOrchestrator.runSource,
  isRunning: scraperOrchestrator.isRunning,
};
