import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ApplicationCard from "../components/ApplicationCard";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import api from "../services/api";
import "../applications.css";

const pageSize = 10;

function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadApplications = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/applications/mine", {
          params: { page, limit: pageSize },
          signal: controller.signal,
        });
        setApplications(data.data);
        setPagination(data.pagination);
      } catch (requestError) {
        if (requestError.code === "ERR_CANCELED") return;
        setError(
          requestError.response?.data?.message ||
            (requestError.request
              ? "Unable to reach HireHub. Check your connection and try again."
              : "We could not load your applications.")
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    loadApplications();
    return () => controller.abort();
  }, [page, refreshCount]);

  return (
    <>
      <Navbar />
      <main className="applications-page">
        <header className="applications-heading">
          <p className="application-eyebrow">YOUR CAREER ACTIVITY</p>
          <h1>My applications</h1>
          <p>Keep track of the opportunities you have applied to and their latest status.</p>
        </header>

        {isLoading && <p className="application-state" role="status">Loading your applications…</p>}
        {!isLoading && error && (
          <section className="application-state application-state-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>
              Try again
            </button>
          </section>
        )}
        {!isLoading && !error && applications.length === 0 && (
          <section className="application-state application-empty-state">
            <h2>You haven't applied to any jobs yet.</h2>
            <p>Explore open jobs and internships, then keep your progress organized here.</p>
            <div className="application-empty-actions">
              <Link to="/jobs">Browse jobs</Link>
              <Link to="/internships">Explore internships</Link>
            </div>
          </section>
        )}
        {!isLoading && !error && applications.length > 0 && (
          <>
            <p className="application-result-count">
              {pagination.total} {pagination.total === 1 ? "application" : "applications"}
            </p>
            <div className="application-card-list">
              {applications.map((application) => (
                <ApplicationCard application={application} key={application._id} />
              ))}
            </div>
            {pagination.pages > 1 && (
              <nav className="application-pagination" aria-label="Application pages">
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
      </main>
      <Footer />
    </>
  );
}

export default MyApplications;
