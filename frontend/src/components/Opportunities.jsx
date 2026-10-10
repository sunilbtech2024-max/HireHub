import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

function getErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check your connection and try again.";
  }
  return "We could not load current opportunities.";
}

function Opportunities() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadJobs = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/jobs", {
          params: { page: 1, limit: 2 },
          signal: controller.signal,
        });
        setJobs(data.data);
      } catch (requestError) {
        if (requestError.code !== "ERR_CANCELED") {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadJobs();
    return () => controller.abort();
  }, []);

  return (
    <section className="opportunities-section" id="jobs">

      <div className="section-heading">

        <span>OPPORTUNITIES</span>

        <h2>
          Find Your Next
          <br />
          <span>Career Opportunity</span>
        </h2>

        <p>
          Discover jobs and internships that match
          your skills, interests and career goals.
        </p>

      </div>


      <div className="opportunity-grid" aria-live="polite">
        {isLoading && <p role="status">Loading opportunities…</p>}
        {!isLoading && error && (
          <div role="alert">
            <p>{error}</p>
            <Link to="/jobs" className="job-details-link">Browse all opportunities</Link>
          </div>
        )}
        {!isLoading && !error && jobs.length === 0 && (
          <div>
            <p>No opportunities are available right now.</p>
            <Link to="/jobs" className="job-details-link">Browse all opportunities</Link>
          </div>
        )}
        {!isLoading && !error && jobs.map((job) => (
          <Link
            className="opportunity-card homepage-card-link"
            key={job._id}
            to={`/jobs/${job._id}`}
          >
            <div className="opportunity-top">
              <div className="company-logo">
                {job.companyId?.companyName?.charAt(0).toUpperCase() || "H"}
              </div>
              <span className="opportunity-type">
                {job.type === "internship" ? "Internship" : "Full Time"}
              </span>
            </div>

            <h3>{job.title}</h3>
            <p className="company-name">{job.companyId?.companyName || "Company"}</p>
            <p className="job-location">
              📍 {job.location}{job.workMode ? ` · ${job.workMode}` : ""}
            </p>
            {job.skillsRequired?.length > 0 && (
              <div className="job-tags">
                {job.skillsRequired.slice(0, 3).map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            )}
            <span className="apply-button">
              View Opportunity →
            </span>
          </Link>
        ))}
      </div>

    </section>
  );
}

export default Opportunities;