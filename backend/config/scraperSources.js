const sourceTemplate = Object.freeze({
  name: "",
  enabled: false,
  baseUrl: "",
  allowedHosts: [],
  requestTimeoutMs: 10000,
  maxRequestsPerMinute: 30,
  maxConcurrency: 1,
  intervalMinutes: 60,
  adapterName: "",
  maxRetries: 1,
  maxRetryAfterMs: 30000,
  maxJobsPerRun: 500,
});

module.exports = {
  sourceTemplate,
  sources: [
    {
      ...sourceTemplate,
      name: "discord",
      enabled: true,
      baseUrl: "https://boards-api.greenhouse.io/v1/boards/discord/jobs?content=true",
      allowedHosts: ["boards-api.greenhouse.io", "job-boards.greenhouse.io"],
      adapterName: "greenhouse",
    },
  ],
};
