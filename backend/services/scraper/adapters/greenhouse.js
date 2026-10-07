const getText = (value) => (typeof value === "string" ? value : "");

class GreenhouseAdapter {
  async fetchJobs(source, { requestJson }) {
    const response = await requestJson(source, source.baseUrl);
    if (!response || !Array.isArray(response.jobs)) {
      throw new TypeError("Greenhouse returned an invalid jobs response");
    }

    return response.jobs.map((job) => ({
      sourceJobId: job.id == null ? "" : String(job.id),
      title: getText(job.title),
      companyName: getText(job.company_name),
      description: getText(job.content),
      responsibilities: [],
      requirements: [],
      skillsRequired: [],
      location: getText(job.location?.name),
      workMode: null,
      employmentType: "",
      salary: "",
      sourceUrl: getText(job.absolute_url),
      postedAt: job.first_published || job.updated_at || null,
      expiresAt: job.application_deadline || null,
    }));
  }
}

module.exports = new GreenhouseAdapter();
