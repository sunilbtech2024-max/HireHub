const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const ScrapedJob = require("../models/ScrapedJob");
const { getExternalJobs } = require("../controllers/externalJobController");

const originalFind = ScrapedJob.find;
const originalCountDocuments = ScrapedJob.countDocuments;

afterEach(() => {
  ScrapedJob.find = originalFind;
  ScrapedJob.countDocuments = originalCountDocuments;
});

const invokeController = async (query) => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let forwardedError;
  await getExternalJobs({ query }, response, (error) => {
    forwardedError = error;
  });
  return { response, forwardedError };
};

test("external jobs endpoint filters active unexpired jobs and returns a bounded page", async () => {
  let findFilter;
  let countFilter;
  const queryOptions = {};
  const jobs = [{ _id: "external-1", title: "Engineer" }];
  ScrapedJob.find = (filter) => {
    findFilter = filter;
    const query = {
      select(value) {
        queryOptions.select = value;
        return query;
      },
      sort(value) {
        queryOptions.sort = value;
        return query;
      },
      skip(value) {
        queryOptions.skip = value;
        return query;
      },
      limit(value) {
        queryOptions.limit = value;
        return query;
      },
      lean: async () => jobs,
    };
    return query;
  };
  ScrapedJob.countDocuments = async (filter) => {
    countFilter = filter;
    return 21;
  };

  const { response, forwardedError } = await invokeController({
    page: "2",
    limit: "10",
    search: "C++",
    location: "New York",
    workMode: "remote",
    skills: "Node.js,React",
  });

  assert.equal(forwardedError, undefined);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(response.body.data, jobs);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 10,
    total: 21,
    pages: 3,
  });
  assert.equal(findFilter.status, "active");
  assert.ok(findFilter.$or.some((condition) => condition.expiresAt === null));
  assert.ok(
    findFilter.$or.some(
      (condition) => condition.expiresAt?.$gt instanceof Date
    )
  );
  assert.equal(findFilter.location.source, "New York");
  assert.equal(findFilter.workMode, "remote");
  assert.deepEqual(
    findFilter.skillsRequired.$in.map((pattern) => pattern.source),
    ["^Node\\.js$", "^React$"]
  );
  assert.equal(findFilter.$and[0].$or[0].title.source, "C\\+\\+");
  assert.equal(countFilter, findFilter);
  assert.equal(queryOptions.skip, 10);
  assert.equal(queryOptions.limit, 10);
  assert.deepEqual(queryOptions.sort, { postedAt: -1, createdAt: -1 });
  assert.match(queryOptions.select, /sourceUrl/);
});

test("external jobs endpoint rejects unsupported filters and invalid pagination", async () => {
  const invalidWorkMode = await invokeController({ workMode: "remote-ish" });
  assert.equal(invalidWorkMode.response.statusCode, 400);
  assert.match(invalidWorkMode.response.body.message, /Work mode/);

  const invalidLimit = await invokeController({ limit: "101" });
  assert.equal(invalidLimit.response.statusCode, 400);
  assert.match(invalidLimit.response.body.message, /limit/);

  const tooManySkills = await invokeController({
    skills: Array.from({ length: 21 }, (_, index) => `skill${index}`).join(","),
  });
  assert.equal(tooManySkills.response.statusCode, 400);
  assert.match(tooManySkills.response.body.message, /20 skills/);
});
