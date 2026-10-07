import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ApplicantList from "../components/ApplicantList";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import api from "../services/api";
import "../applications.css";

const pageSize = 10;

function CompanyApplicants() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadApplicants = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/jobs/${jobId}/applications`, {
          params: { page, limit: pageSize },
          signal: controller.signal,
        });
        setJob(data.job);
        setApplications(data.data);
        setPagination(data.pagination);
      } catch (requestError) {
        if (requestError.code === "ERR_CANCELED") return;
        setError(
          requestError.response?.data?.message ||
            (requestError.response?.status === 403
              ? "You do not have permission to view applicants for this job."
              : requestError.request
                ? "Unable to reach HireHub. Check your connection and try again."
                : "We could not load applicants for this job.")
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    loadApplicants();
    return () => controller.abort();
  }, [jobId, page, refreshCount]);

  const updateApplication = (updated) => {
    setApplications((current) =>
      current.map((application) => application._id === updated._id ? updated : application)
    );
  };

  return (
    <>
      <Navbar />
      <main className="applications-page company-applicants-page">
        <Link className="application-back-link" to="/account">← Back to company profile</Link>
        {isLoading && <p className="application-state" role="status">Loading applicants…</p>}
        {!isLoading && error && (
          <section className="application-state application-state-error" role="alert">
            <h1>Applicants unavailable</h1>
            <p>{error}</p>
            <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>
              Try again
            </button>
          </section>
        )}
        {!isLoading && !error && job && (
          <>
            <header className="applications-heading">
              <p className="application-eyebrow">CANDIDATE MANAGEMENT</p>
              <h1>Applicants</h1>
              <p>{job.title} · {job.type === "internship" ? "Internship" : "Job"} · {job.location}</p>
              <p>{pagination.total} {pagination.total === 1 ? "applicant" : "applicants"}</p>
            </header>
            {applications.length === 0 ? (
              <section className="application-state application-empty-state">
                <h2>No applications yet</h2>
                <p>Applications for this opportunity will appear here.</p>
              </section>
            ) : (
              <>
                <ApplicantList applications={applications} onStatusUpdated={updateApplication} />
                {pagination.pages > 1 && (
                  <nav className="application-pagination" aria-label="Applicant pages">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                      Previous
                    </button>
                    <span>Page {page} of {pagination.pages}</span>
                    <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)}>
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

export default CompanyApplicants;
