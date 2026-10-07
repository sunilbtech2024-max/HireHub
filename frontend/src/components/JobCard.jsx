import { Link } from "react-router-dom";

function JobCard({ job }) {
  const company = job.companyId;
  const companyName = company?.companyName || "Company";
  const compensation = job.type === "internship" ? job.stipend : job.salary;

  return (
    <article className="job-listing-card">
      <div className="job-listing-card-header">
        {company?.logo ? (
          <img className="job-company-logo" src={company.logo} alt="" />
        ) : (
          <span className="job-company-logo job-company-initial" aria-hidden="true">
            {companyName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="job-listing-company">
          <p>{companyName}</p>
          {company?.industry && <span>{company.industry}</span>}
        </div>
        <span className="job-type-label">
          {job.type === "internship" ? "Internship" : "Full-time"}
        </span>
      </div>

      <h2>{job.title}</h2>
      <div className="job-listing-meta">
        <span>{job.location}</span>
        <span>{job.workMode}</span>
        {job.experience && <span>{job.experience}</span>}
        {compensation && <span>{compensation}</span>}
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

      {Number.isFinite(job.matchScore) && (
        <section className="job-match-details" aria-label={`${job.matchScore}% resume match`}>
          <strong>{job.matchScore}% Match</strong>
          <p>
            Matched skills: {job.matchedSkills?.length ? job.matchedSkills.join(", ") : "None"}
          </p>
          <p>
            Missing skills: {job.missingSkills?.length ? job.missingSkills.join(", ") : "None"}
          </p>
          {job.matchBreakdown?.length > 0 && (
            <p>
              Match factors: {job.matchBreakdown.map((factor) =>
                `${factor.factor} ${factor.score}% (weight ${factor.weight}%)`
              ).join(" · ")}
            </p>
          )}
          <small>Score is based on listed skills, experience, and education criteria.</small>
        </section>
      )}

      <div className="job-listing-card-footer">
        <span>
          Posted {new Date(job.createdAt).toLocaleDateString()}
        </span>
        <Link className="job-details-link" to={`/jobs/${job._id}`}>
          View details <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default JobCard;
