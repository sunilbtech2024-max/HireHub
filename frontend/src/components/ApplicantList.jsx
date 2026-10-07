import { useState } from "react";
import api from "../services/api";
import statusLabels from "../utils/applicationStatus";

const companyStatuses = ["under_review", "shortlisted", "interview", "selected", "rejected"];

function ApplicantList({ applications, onStatusUpdated }) {
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const updateStatus = async (applicationId, status) => {
    setError("");
    setMessage("");
    setUpdatingId(applicationId);
    try {
      const { data } = await api.patch(`/applications/${applicationId}/status`, { status });
      onStatusUpdated(data.data);
      setMessage("Application status updated.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          (requestError.request
            ? "Unable to reach HireHub. Check your connection and try again."
            : "We could not update this application.")
      );
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <div className="applicant-list">
      {error && <p className="application-error" role="alert">{error}</p>}
      {message && <p className="application-success" role="status">{message}</p>}
      {applications.map((application) => (
        <article className="applicant-card" key={application._id}>
          <div className="applicant-card-heading">
            <div>
              <h2>{application.studentId?.name || "Candidate"}</h2>
              <a href={`mailto:${application.studentId?.email || ""}`}>
                {application.studentId?.email}
              </a>
            </div>
            <span className={`application-status-badge status-${application.status}`}>
              {statusLabels[application.status] || application.status}
            </span>
          </div>
          <p className="applicant-card-date">
            Applied {new Date(application.appliedAt).toLocaleString()}
          </p>
          {application.resume?.fileUrl && (
            <p className="applicant-resume">
              Resume:{" "}
              <a href={application.resume.fileUrl} target="_blank" rel="noreferrer">
                {application.resume.fileName || "View resume"}
              </a>
            </p>
          )}
          {application.coverLetter && (
            <section className="applicant-cover-letter">
              <h3>Cover letter</h3>
              <p>{application.coverLetter}</p>
            </section>
          )}
          {!["selected", "rejected", "withdrawn"].includes(application.status) && (
            <label className="applicant-status-control">
              Update status
              <select
                value={application.status}
                onChange={(event) => updateStatus(application._id, event.target.value)}
                disabled={updatingId === application._id}
              >
                <option value={application.status} disabled>
                  {statusLabels[application.status] || application.status}
                </option>
                {companyStatuses
                  .filter((status) => status !== application.status)
                  .map((status) => (
                    <option value={status} key={status}>{statusLabels[status]}</option>
                  ))}
              </select>
              {updatingId === application._id && <span role="status">Updating…</span>}
            </label>
          )}
        </article>
      ))}
    </div>
  );
}

export default ApplicantList;
