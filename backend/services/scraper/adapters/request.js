const axios = require("axios");
const dns = require("dns");
const { isPublicAddress, validateSourceConfig, validateSourceUrl } = require("../validate");

const queues = new Map();
const maxResponseBytes = 2 * 1024 * 1024;

class SourceRequestError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = "SourceRequestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const parseRetryAfter = (value, now) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
};

const createSafeLookup = (lookup) => (hostname, options, callback) => {
  const resolvedCallback = typeof options === "function" ? options : callback;
  lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        resolvedCallback(new SourceRequestError("SOURCE_HOST_NOT_PUBLIC"));
        return;
      }
      if (typeof options === "object" && options.all) {
        resolvedCallback(null, addresses);
        return;
      }
      const address = addresses[0];
      resolvedCallback(null, address.address, address.family);
    })
    .catch(() => resolvedCallback(new SourceRequestError("SOURCE_HOST_NOT_PUBLIC")));
};

const createSourceRequester = ({
  httpClient = axios,
  lookup = dns.promises.lookup,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
} = {}) => {
  const requestJson = async (source, url, options = {}) => {
    const configResult = validateSourceConfig(source);
    if (!configResult.valid) {
      throw new SourceRequestError("INVALID_SOURCE_CONFIGURATION");
    }
    const urlResult = await validateSourceUrl(url, configResult.source, lookup);
    if (!urlResult.valid) throw new SourceRequestError(urlResult.code);

    const previous = queues.get(source.name) || Promise.resolve();
    let release;
    const ticket = new Promise((resolve) => {
      release = resolve;
    });
    const queueTail = previous.then(() => ticket);
    queues.set(source.name, queueTail);
    await previous;

    try {
      const minimumInterval = Math.ceil(60000 / source.maxRequestsPerMinute);
      const lastRequestAt = requestJson.lastRequestAt.get(source.name);
      if (lastRequestAt !== undefined) {
        const remaining = minimumInterval - (now() - lastRequestAt);
        if (remaining > 0) await sleep(remaining);
      }

      for (let attempt = 0; attempt <= source.maxRetries; attempt += 1) {
        requestJson.lastRequestAt.set(source.name, now());
        let response;
        try {
          response = await httpClient.request({
            url: urlResult.sourceUrl,
            method: options.method || "get",
            headers: options.headers,
            params: options.params,
            data: options.data,
            timeout: source.requestTimeoutMs,
            maxRedirects: 0,
            maxContentLength: maxResponseBytes,
            maxBodyLength: maxResponseBytes,
            responseType: "json",
            validateStatus: () => true,
            proxy: false,
            lookup: createSafeLookup(lookup),
          });
        } catch (error) {
          if (attempt < source.maxRetries) {
            await sleep(Math.min(500 * (2 ** attempt), 5000));
            continue;
          }
          throw new SourceRequestError(
            error.code === "ECONNABORTED" ? "SOURCE_REQUEST_TIMEOUT" : "SOURCE_REQUEST_FAILED"
          );
        }

        if (response.status >= 200 && response.status < 300) return response.data;

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= source.maxRetries) {
          throw new SourceRequestError("SOURCE_HTTP_ERROR", response.status);
        }

        const retryAfter = parseRetryAfter(
          response.headers?.["retry-after"],
          now()
        );
        if (retryAfter !== null && retryAfter > source.maxRetryAfterMs) {
          throw new SourceRequestError("SOURCE_RETRY_AFTER_TOO_LONG", response.status);
        }
        await sleep(
          retryAfter === null
            ? Math.min(500 * (2 ** attempt), 5000)
            : retryAfter
        );
      }

      throw new SourceRequestError("SOURCE_REQUEST_FAILED");
    } finally {
      release();
      if (queues.get(source.name) === queueTail) queues.delete(source.name);
    }
  };

  requestJson.lastRequestAt = new Map();
  return requestJson;
};

const requestJson = createSourceRequester();

module.exports = { SourceRequestError, createSourceRequester, requestJson };
