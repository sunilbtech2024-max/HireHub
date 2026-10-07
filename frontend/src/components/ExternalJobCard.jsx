const formatDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString();
};

const getSafeSourceUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

function ExternalJobCard({ job }) {
  const sourceUrl = getSafeSourceUrl(job.sourceUrl);
  const sourceName = job.source
    ? job.source.charAt(0).toUpperCase() + job.source.slice(1)
    : "External";

  return (
    <article className="job-listing-card">
      <div className="job-listing-card-header">
        <span className="job-company-logo job-company-initial" aria-hidden="true">
          {job.companyName?.charAt(0).toUpperCase() || "?"}
        </span>
        <div className="job-listing-company">
          <p>{job.companyName || "Company"}</p>
          <span>Source: {sourceName}</span>
        </div>
        <span className="job-type-label">External listing</span>
      </div>

      <h2>{job.title}</h2>
      <div className="job-listing-meta">
        {job.location && <span>{job.location}</span>}
        {job.workMode && <span>{job.workMode}</span>}
        {job.employmentType && <span>{job.employmentType}</span>}
        {job.salary && <span>{job.salary}</span>}
      </div>
      <p className="job-listing-description">{job.description}</p>

      {job.skillsRequired?.length > 0 && (
        <ul className="job-listing-skills" aria-label="Required skills">
          {job.skillsRequired.slice(0, 6).map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
          {job.skillsRequired.length > 6 && (
            <li>+{job.skillsRequired.length - 6}</li>
          )}
        </ul>
      )}

      <div className="job-listing-card-footer">
        <span>Posted {formatDate(job.postedAt || job.createdAt)}</span>
        {sourceUrl ? (
          <a
            className="job-details-link"
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Original Job <span aria-hidden="true">→</span>
          </a>
        ) : (
          <span>Source link unavailable</span>
        )}
      </div>
    </article>
  );
}

export default ExternalJobCard;
