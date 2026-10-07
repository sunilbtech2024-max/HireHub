import { Link } from "react-router-dom";
import statusLabels from "../utils/applicationStatus";

function ApplicationCard({ application }) {
  const job = application.jobId;
  const companyName = job?.companyId?.companyName || "Company";
  const appliedDate = new Date(application.appliedAt).toLocaleDateString();

  return (
    <article className="application-card">
      <div className="application-card-main">
        <div>
          <p className="application-card-company">{companyName}</p>
          <h2>{job?.title || "Opportunity no longer available"}</h2>
        </div>
        <span className={`application-status-badge status-${application.status}`}>
          {statusLabels[application.status] || application.status}
        </span>
      </div>
      <div className="application-card-meta">
        <span>{job?.type === "internship" ? "Internship" : "Job"}</span>
        {job?.location && <span>{job.location}</span>}
        {job?.workMode && <span>{job.workMode}</span>}
        <span>Applied {appliedDate}</span>
      </div>
      <div className="application-card-actions">
        {job?._id && <Link to={`/jobs/${job._id}`}>View job</Link>}
        <Link to={`/applications/${application._id}`}>View application</Link>
      </div>
    </article>
  );
}

export default ApplicationCard;
