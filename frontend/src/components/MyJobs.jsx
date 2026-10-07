import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0 });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadJobs = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/applications/company/jobs", {
          params: { page, limit: 10 },
          signal: controller.signal,
        });
        setJobs(data.data);
        setPagination(data.pagination);
      } catch (requestError) {
        if (requestError.code === "ERR_CANCELED") return;
        setError(
          requestError.response?.data?.message ||
            (requestError.request
              ? "Unable to reach HireHub. Check your connection and try again."
              : "We could not load your job postings.")
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    loadJobs();
    return () => controller.abort();
  }, [page, refreshCount]);

  return (
    <section className="profile-card my-jobs-section" aria-labelledby="my-jobs-heading">
      <div className="profile-section-heading">
        <h2 id="my-jobs-heading">My jobs</h2>
        <p>Review your postings and manage their applicants.</p>
      </div>
      {isLoading && <p role="status">Loading your job postings…</p>}
      {!isLoading && error && (
        <div className="application-state-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>
            Try again
          </button>
        </div>
      )}
      {!isLoading && !error && jobs.length === 0 && (
        <p>You have not created any job or internship postings yet.</p>
      )}
      {!isLoading && !error && jobs.length > 0 && (
        <>
          <div className="my-jobs-list">
            {jobs.map((job) => (
              <article className="my-job-row" key={job._id}>
                <div>
                  <h3>{job.title}</h3>
                  <p>
                    {job.type === "internship" ? "Internship" : "Job"} · {job.location} · {job.status}
                  </p>
                  <span>{job.applicantCount} {job.applicantCount === 1 ? "applicant" : "applicants"}</span>
                </div>
                <Link to={`/company/jobs/${job._id}/applications`}>View applicants</Link>
              </article>
            ))}
          </div>
          {pagination.pages > 1 && (
            <nav className="application-pagination" aria-label="Company job pages">
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
    </section>
  );
}

export default MyJobs;
