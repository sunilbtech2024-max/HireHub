import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ApplicationStatus from "../components/ApplicationStatus";
import statusLabels from "../utils/applicationStatus";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import api from "../services/api";
import "../applications.css";

function ApplicationDetails() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadApplication = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/applications/${id}`, { signal: controller.signal });
        setApplication(data.data);
      } catch (requestError) {
        if (requestError.code === "ERR_CANCELED") return;
        setError(
          requestError.response?.data?.message ||
            (requestError.request
              ? "Unable to reach HireHub. Check your connection and try again."
              : "We could not load this application.")
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    loadApplication();
    return () => controller.abort();
  }, [id]);

  const withdraw = async () => {
    setActionError("");
    setIsWithdrawing(true);
    try {
      const { data } = await api.patch(`/applications/${id}/withdraw`);
      setApplication(data.data);
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.message ||
          (requestError.request
            ? "Unable to reach HireHub. Check your connection and try again."
            : "We could not withdraw this application.")
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  const job = application?.jobId;

  return (
    <>
      <Navbar />
      <main className="applications-page application-detail-page">
        <Link className="application-back-link" to="/applications">← Back to my applications</Link>
        {isLoading && <p className="application-state" role="status">Loading application…</p>}
        {!isLoading && error && (
          <section className="application-state application-state-error" role="alert">
            <h1>Application unavailable</h1>
            <p>{error}</p>
            <Link to="/applications">Return to my applications</Link>
          </section>
        )}
        {!isLoading && !error && application && (
          <article className="application-detail-card">
            <header className="application-detail-heading">
              <div>
                <p className="application-eyebrow">{job?.type === "internship" ? "INTERNSHIP APPLICATION" : "JOB APPLICATION"}</p>
                <h1>{job?.title || "Opportunity no longer available"}</h1>
                <p>{job?.companyId?.companyName || "Company"}{job?.location && ` · ${job.location}`}</p>
              </div>
            </header>

            <div className="application-detail-facts">
              <div>
                <span>Applied</span>
                <strong>{new Date(application.appliedAt).toLocaleString()}</strong>
              </div>
              <div>
                <span>Current status</span>
                <strong className={`application-status-badge status-${application.status}`}>
                  {statusLabels[application.status] || application.status}
                </strong>
              </div>
            </div>

            <section className="application-detail-section">
              <h2>Status history</h2>
              <ApplicationStatus status={application.status} history={application.statusHistory} />
            </section>
            {application.resume?.fileUrl && (
              <section className="application-detail-section">
                <h2>Resume submitted</h2>
                <a href={application.resume.fileUrl} target="_blank" rel="noreferrer">
                  {application.resume.fileName || "View resume"}
                </a>
              </section>
            )}
            <section className="application-detail-section">
              <h2>Cover letter</h2>
              <p>{application.coverLetter || "No cover letter was submitted."}</p>
            </section>
            {actionError && <p className="application-error" role="alert">{actionError}</p>}
            {!["selected", "rejected", "withdrawn"].includes(application.status) && (
              <button
                type="button"
                className="application-secondary-button"
                onClick={withdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? "Withdrawing…" : "Withdraw application"}
              </button>
            )}
          </article>
        )}
      </main>
      <Footer />
    </>
  );
}

export default ApplicationDetails;
