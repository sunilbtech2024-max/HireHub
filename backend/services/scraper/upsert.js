const crypto = require("crypto");
const ScrapedJob = require("../../models/ScrapedJob");

const sourceOwnedFields = [
  "title",
  "companyName",
  "description",
  "responsibilities",
  "requirements",
  "skillsRequired",
  "location",
  "workMode",
  "employmentType",
  "salary",
  "sourceUrl",
  "postedAt",
  "expiresAt",
];

const getSourceData = (record) =>
  Object.fromEntries(sourceOwnedFields.map((field) => [field, record[field] ?? null]));

const hashSourceData = (record) =>
  crypto.createHash("sha256").update(JSON.stringify(getSourceData(record))).digest("hex");

const getIdentity = (record) => ({
  source: record.source,
  ...(record.sourceJobId
    ? { sourceJobId: record.sourceJobId }
    : { sourceJobId: null, sourceUrl: record.sourceUrl }),
});

const upsertScrapedJob = async (
  record,
  { model = ScrapedJob, now = new Date() } = {}
) => {
  const identity = getIdentity(record);
  const rawDataHash = hashSourceData(record);
  const status =
    record.expiresAt && record.expiresAt.getTime() <= now.getTime()
      ? "expired"
      : "active";
  const existing = await model.findOne(identity);

  if (!existing) {
    try {
      await model.create({
        ...record,
        status,
        rawDataHash,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      return { outcome: "inserted" };
    } catch (error) {
      if (error.code !== 11000) throw error;
      const duplicate = await model.findOne(identity);
      if (!duplicate) throw error;
      return updateExisting(duplicate, record, rawDataHash, status, now);
    }
  }

  return updateExisting(existing, record, rawDataHash, status, now);
};

const updateExisting = async (existing, record, hash, status, now) => {
  if (existing.rawDataHash === hash && existing.status === status) {
    existing.lastSeenAt = now;
    await existing.save();
    return { outcome: "skipped" };
  }

  const wasActive = existing.status === "active";
  for (const field of sourceOwnedFields) {
    existing[field] = record[field];
  }
  existing.rawDataHash = hash;
  existing.status = status;
  existing.lastSeenAt = now;
  await existing.save();

  return {
    outcome: status === "expired" && wasActive ? "expired" : "updated",
  };
};

const expireDueJobs = async (
  source,
  { model = ScrapedJob, now = new Date() } = {}
) => {
  const result = await model.updateMany(
    { source, status: "active", expiresAt: { $ne: null, $lte: now } },
    { $set: { status: "expired" } }
  );
  return result.modifiedCount || 0;
};

const closeMissingJobs = async (
  source,
  sourceJobIds,
  { model = ScrapedJob } = {}
) => {
  const result = await model.updateMany(
    {
      source,
      status: "active",
      sourceJobId: { $type: "string", $nin: sourceJobIds },
    },
    { $set: { status: "closed" } }
  );
  return result.modifiedCount || 0;
};

module.exports = {
  hashSourceData,
  upsertScrapedJob,
  expireDueJobs,
  closeMissingJobs,
};
