const mongoose = require("mongoose");
const { sources: configuredSources } = require("../../config/scraperSources");
const { getAdapter } = require("./adapters");
const { runSources, isRunning } = require("./orchestrator");
const { validateSourceConfig } = require("./validate");

let timers = [];

const startScheduler = ({
  sources = configuredSources,
  run = runSources,
  isRunInProgress = isRunning,
  connection = mongoose.connection,
} = {}) => {
  if (!connection || connection.readyState !== 1) {
    throw new Error("The scraper scheduler requires an active MongoDB connection");
  }
  if (timers.length) return { started: true, reason: "already_started" };

  const enabledSources = sources.filter((source) => source?.enabled === true);
  if (!enabledSources.length) {
    return { started: false, reason: "no_enabled_sources" };
  }
  if (
    enabledSources.some(
      (source) => !validateSourceConfig(source).valid || !getAdapter(source.adapterName)
    )
  ) {
    throw new Error("An enabled scraper source has invalid configuration or no adapter");
  }

  timers = enabledSources.map((source) => {
    const timer = setInterval(() => {
      if (!isRunInProgress()) {
        run([source]).catch(() => {
          console.error("Scheduled scraper run could not be started.");
        });
      }
    }, source.intervalMinutes * 60 * 1000);
    timer.unref?.();
    return timer;
  });
  return { started: true, reason: "enabled_sources_scheduled" };
};

const stopScheduler = () => {
  timers.forEach(clearInterval);
  timers = [];
};

const isSchedulerRunning = () => timers.length > 0;

module.exports = { startScheduler, stopScheduler, isSchedulerRunning };
