import { useEffect, useState } from "react";
import api from "../services/api";
import Footer from "../components/Footer";
import JobCard from "../components/JobCard";
import Navbar from "../components/Navbar";
import "../jobs.css";

function getErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check your connection and try again.";
  }
  return "We could not load job matches. Please try again.";
}

function JobMatching() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadRecommendations = async () => {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/ai/jobs/recommended", {
          signal: controller.signal,
        });
        if (!Array.isArray(data.data)) {
          throw new Error("HireHub returned an invalid job recommendation response.");
        }
        setJobs(data.data);
      } catch (requestError) {
        if (requestError.code !== "ERR_CANCELED") {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadRecommendations();
    return () => controller.abort();
  }, [refreshCount]);

  return (
    <>
      <Navbar />
      <main className="job-board-page">
        <header className="job-board-heading">
          <p className="job-board-eyebrow">PERSONALIZED FOR YOU</p>
          <h1>AI Job Matching</h1>
          <p>
            Explore jobs recommended based on the skills and experience in
            your resume.
          </p>
        </header>

        <section className="job-results" aria-live="polite">
          <div className="job-results-heading">
            <h2>Recommended jobs</h2>
            {!isLoading && !error && (
              <span>
                {jobs.length} {jobs.length === 1 ? "match" : "matches"}
              </span>
            )}
          </div>

          {isLoading && (
            <p className="job-board-message" role="status">
              Finding jobs that match your resume…
            </p>
          )}

          {!isLoading && error && (
            <div className="job-board-message job-board-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="job-retry-button"
                onClick={() => setRefreshCount((count) => count + 1)}
              >
                Try again
              </button>
            </div>
          )}

          {!isLoading && !error && jobs.length === 0 && (
            <div className="job-board-message">
              <h3>No job matches yet</h3>
              <p>
                Upload and analyze your resume to get personalized job
                recommendations.
              </p>
            </div>
          )}

          {!isLoading && !error && jobs.length > 0 && (
            <div className="job-results-list">
              {jobs.map((job) => (
                <JobCard key={job._id} job={job} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

export default JobMatching;
