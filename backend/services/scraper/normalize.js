const cleanText = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

const cleanDescription = (value) => {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const normalizeWorkMode = (value) => {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (/\b(remote|work from home|wfh)\b/.test(text)) return "remote";
  if (/\b(hybrid)\b/.test(text)) return "hybrid";
  if (/\b(on.?site|in.?office|office.?based)\b/.test(text)) return "onsite";
  return null;
};

const normalizeList = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
};

const normalizeSourceUrl = (value) => {
  const text = cleanText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.href;
  } catch {
    return text;
  }
};

const normalizeDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
};

const normalizeJob = (record) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {};
  }

  return {
    sourceJobId: cleanText(record.sourceJobId),
    title: cleanText(record.title),
    companyName: cleanText(record.companyName),
    description: cleanDescription(record.description),
    responsibilities: normalizeList(record.responsibilities),
    requirements: normalizeList(record.requirements),
    skillsRequired: normalizeList(record.skillsRequired),
    location: cleanText(record.location),
    workMode: normalizeWorkMode(record.workMode),
    employmentType: cleanText(record.employmentType),
    salary: cleanText(record.salary),
    sourceUrl: normalizeSourceUrl(record.sourceUrl),
    postedAt: normalizeDate(record.postedAt),
    expiresAt: normalizeDate(record.expiresAt),
  };
};

module.exports = {
  cleanText,
  cleanDescription,
  normalizeWorkMode,
  normalizeSourceUrl,
  normalizeJob,
};
