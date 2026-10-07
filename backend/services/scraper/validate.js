const dns = require("dns");
const net = require("net");

const isPrivateIpv4 = (address) => {
  const octets = address.split(".").map(Number);
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && [0, 2, 88, 168].includes(second)) ||
    (first === 198 && [18, 19, 51].includes(second)) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
};

const isPrivateIpv6 = (address) => {
  const normalized = address.toLowerCase().split("%")[0];
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("::ffff:")
  ) {
    return true;
  }
  return !/^[2-3][0-9a-f]{0,3}:/i.test(normalized);
};

const isPublicAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) return !isPrivateIpv6(address);
  return false;
};

const isLocalHostname = (hostname) =>
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  hostname.endsWith(".local") ||
  hostname.endsWith(".internal") ||
  hostname.endsWith(".test") ||
  hostname.endsWith(".invalid") ||
  hostname.endsWith(".example");

const validateSourceConfig = (source) => {
  if (
    !source ||
    typeof source.name !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(source.name) ||
    typeof source.baseUrl !== "string" ||
    !Array.isArray(source.allowedHosts) ||
    source.allowedHosts.length === 0 ||
    typeof source.adapterName !== "string" ||
    !source.adapterName.trim()
  ) {
    return { valid: false, code: "INVALID_SOURCE_CONFIGURATION" };
  }

  let baseUrl;
  try {
    baseUrl = new URL(source.baseUrl);
  } catch {
    return { valid: false, code: "INVALID_SOURCE_CONFIGURATION" };
  }

  const allowedHosts = source.allowedHosts.map((host) =>
    typeof host === "string" ? host.toLowerCase() : ""
  );
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username ||
    baseUrl.password ||
    net.isIP(baseUrl.hostname) ||
    isLocalHostname(baseUrl.hostname) ||
    !allowedHosts.includes(baseUrl.hostname) ||
    allowedHosts.some((host) => !host || host.includes("*") || isLocalHostname(host) || net.isIP(host))
  ) {
    return { valid: false, code: "INVALID_SOURCE_CONFIGURATION" };
  }

  const integerBounds = [
    [source.requestTimeoutMs, 100, 120000],
    [source.maxRequestsPerMinute, 1, 600],
    [source.maxConcurrency, 1, 5],
    [source.intervalMinutes, 1, 10080],
    [source.maxRetries, 0, 2],
    [source.maxRetryAfterMs, 0, 300000],
    [source.maxJobsPerRun, 1, 5000],
  ];
  if (
    integerBounds.some(
      ([value, min, max]) => !Number.isInteger(value) || value < min || value > max
    )
  ) {
    return { valid: false, code: "INVALID_SOURCE_CONFIGURATION" };
  }

  return { valid: true, source: { ...source, allowedHosts } };
};

const validateSourceUrl = async (value, source, lookup = dns.promises.lookup) => {
  if (typeof value !== "string" || !value.trim()) {
    return { valid: false, code: "SOURCE_URL_REQUIRED" };
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return { valid: false, code: "INVALID_SOURCE_URL" };
  }

  const allowedHosts = (source?.allowedHosts || []).map((host) =>
    typeof host === "string" ? host.toLowerCase() : ""
  );
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    net.isIP(url.hostname) ||
    isLocalHostname(url.hostname) ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  ) {
    return { valid: false, code: "SOURCE_URL_NOT_ALLOWED" };
  }

  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      return { valid: false, code: "SOURCE_HOST_NOT_PUBLIC" };
    }
  } catch {
    return { valid: false, code: "SOURCE_HOST_UNRESOLVABLE" };
  }

  url.hash = "";
  return { valid: true, sourceUrl: url.href };
};

const validateNormalizedJob = async (record, source, lookup) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, code: "INVALID_RECORD" };
  }
  if (
    typeof record.title !== "string" ||
    !record.title.trim() ||
    record.title.length > 200 ||
    typeof record.companyName !== "string" ||
    !record.companyName.trim() ||
    record.companyName.length > 200
  ) {
    return { valid: false, code: "REQUIRED_JOB_FIELDS_MISSING" };
  }
  if (
    (record.sourceJobId &&
      (typeof record.sourceJobId !== "string" ||
        record.sourceJobId.length > 256)) ||
    typeof record.description !== "string" ||
    record.description.length > 20000 ||
    !Array.isArray(record.responsibilities) ||
    !Array.isArray(record.requirements) ||
    !Array.isArray(record.skillsRequired) ||
    [record.responsibilities, record.requirements, record.skillsRequired].some(
      (items) =>
        items.length > 100 ||
        items.some(
          (item) =>
            typeof item !== "string" ||
            !item.trim() ||
            item.length > 1000
        )
    ) ||
    typeof record.location !== "string" ||
    record.location.length > 300 ||
    (record.workMode !== null &&
      !["onsite", "hybrid", "remote"].includes(record.workMode)) ||
    typeof record.employmentType !== "string" ||
    record.employmentType.length > 80 ||
    typeof record.salary !== "string" ||
    record.salary.length > 200
  ) {
    return { valid: false, code: "INVALID_RECORD" };
  }
  for (const field of ["postedAt", "expiresAt"]) {
    if (
      record[field] !== null &&
      record[field] !== undefined &&
      (!(record[field] instanceof Date) || Number.isNaN(record[field].getTime()))
    ) {
      return { valid: false, code: "INVALID_JOB_DATE" };
    }
  }

  const urlResult = await validateSourceUrl(record.sourceUrl, source, lookup);
  if (!urlResult.valid) return urlResult;

  return {
    valid: true,
    record: {
      ...record,
      source: source.name,
      sourceJobId:
        typeof record.sourceJobId === "string" && record.sourceJobId.trim()
          ? record.sourceJobId.trim()
          : null,
      sourceUrl: urlResult.sourceUrl,
    },
  };
};

module.exports = {
  isPublicAddress,
  validateSourceConfig,
  validateSourceUrl,
  validateNormalizedJob,
};
