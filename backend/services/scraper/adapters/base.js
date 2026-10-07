class SourceAdapter {
  async fetchJobs(_source, _context) {
    throw new Error("A source adapter must implement fetchJobs(source, { requestJson })");
  }
}

module.exports = SourceAdapter;
