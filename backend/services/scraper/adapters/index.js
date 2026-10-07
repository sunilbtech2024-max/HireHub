const adapters = new Map();

const registerAdapter = (name, adapter) => {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    !adapter ||
    typeof adapter.fetchJobs !== "function"
  ) {
    throw new TypeError("An adapter name and fetchJobs(source) implementation are required");
  }
  adapters.set(name, adapter);
};

const getAdapter = (name) => adapters.get(name);

const unregisterAdapter = (name) => adapters.delete(name);

registerAdapter("greenhouse", require("./greenhouse"));

module.exports = { registerAdapter, getAdapter, unregisterAdapter };
