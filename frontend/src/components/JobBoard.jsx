import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import Footer from "./Footer";
import ExternalJobCard from "./ExternalJobCard";
import JobCard from "./JobCard";
import Navbar from "./Navbar";
import "../jobs.css";

const pageSize = 10;

function getErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check your connection and try again.";
  }
  return "We could not load opportunities. Please try again.";
}

function JobBoard({ type }) {
  const isInternship = type === "internship";
  const [listingSource, setListingSource] = useState("hirehub");
  const [filters, setFilters] = useState({
    search: "",
    location: "",
    workMode: "",
    experience: "",
    skills: "",
  });
  const [page, setPage] = useState(1);
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pages: 0,
    total: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");

      const params = { page, limit: pageSize };
      if (listingSource === "hirehub") params.type = type;
      for (const [key, value] of Object.entries(filters)) {
        if (
          value.trim() &&
          (listingSource === "hirehub" || key !== "experience")
        ) {
          params[key] = value.trim();
        }
      }

      try {
        const endpoint =
          listingSource === "external" ? "/external-jobs" : "/jobs";
        const { data } = await api.get(endpoint, {
          params,
          signal: controller.signal,
        });
        setJobs(data.data);
        setPagination(data.pagination);
      } catch (requestError) {
        if (requestError.code !== "ERR_CANCELED") {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, filters.search ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, listingSource, page, refreshCount, type]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      location: "",
      workMode: "",
      experience: "",
      skills: "",
    });
    setPage(1);
  };

  const selectListingSource = (source) => {
    setListingSource(source);
    setPage(1);
  };

  return (
    <>
      <Navbar />
      <main className="job-board-page">
        <header className="job-board-heading">
          <p className="job-board-eyebrow">HIREHUB OPPORTUNITIES</p>
          <h1>{isInternship ? "Internships" : "Find your next role"}</h1>
          <p>
            {isInternship
              ? "Explore internships from companies looking for emerging talent."
              : "Explore current roles from companies looking for skilled people."}
          </p>
        </header>

        <section className="job-board-layout" aria-label="Opportunity search">
          <form className="job-filter-panel" onSubmit={(event) => event.preventDefault()}>
            {!isInternship && (
              <div className="job-source-filter" role="group" aria-label="Job source">
                <button
                  type="button"
                  className={listingSource === "hirehub" ? "is-selected" : ""}
                  aria-pressed={listingSource === "hirehub"}
                  onClick={() => selectListingSource("hirehub")}
                >
                  HireHub jobs
                </button>
                <button
                  type="button"
                  className={listingSource === "external" ? "is-selected" : ""}
                  aria-pressed={listingSource === "external"}
                  onClick={() => selectListingSource("external")}
                >
                  External Jobs
                </button>
              </div>
            )}
            <label className="job-filter-search">
              <span>Search</span>
              <input
                name="search"
                type="search"
                value={filters.search}
                onChange={updateFilter}
                placeholder="Title, skill, or keyword"
              />
            </label>
            <label>
              <span>Location</span>
              <input
                name="location"
                value={filters.location}
                onChange={updateFilter}
                placeholder="City or region"
              />
            </label>
            <label>
              <span>Work mode</span>
              <select name="workMode" value={filters.workMode} onChange={updateFilter}>
                <option value="">All work modes</option>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </label>
            {listingSource === "hirehub" && (
              <label>
                <span>Experience</span>
                <input
                  name="experience"
                  value={filters.experience}
                  onChange={updateFilter}
                  placeholder="e.g. Entry level"
                />
              </label>
            )}
            {listingSource === "hirehub" && (
              <label>
                <span>Skills</span>
                <input
                  name="skills"
                  value={filters.skills}
                  onChange={updateFilter}
                  placeholder="e.g. React, Node.js"
                />
              </label>
            )}
            <button type="button" className="job-clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          </form>

          <section className="job-results" aria-live="polite">
            <div className="job-results-heading">
              <h2>
                {isInternship
                  ? "Open internships"
                  : listingSource === "external"
                    ? "External Jobs"
                    : "Open jobs"}
              </h2>
              {!isLoading && !error && (
                <span>
                  {pagination.total} {pagination.total === 1 ? "result" : "results"}
                </span>
              )}
            </div>

            {isLoading && (
              <p className="job-board-message" role="status">
                Loading {isInternship ? "internships" : "jobs"}…
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
                <h3>No matching opportunities yet</h3>
                <p>Try changing your search or clearing one or more filters.</p>
                <button type="button" className="job-retry-button" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            )}

            {!isLoading && !error && jobs.length > 0 && (
              <>
                <div className="job-results-list">
                  {jobs.map((job) =>
                    listingSource === "external" ? (
                      <ExternalJobCard key={job._id} job={job} />
                    ) : (
                      <JobCard key={job._id} job={job} />
                    )
                  )}
                </div>
                {pagination.pages > 1 && (
                  <nav className="job-pagination" aria-label="Job result pages">
                    <button
                      type="button"
                      onClick={() => setPage((current) => current - 1)}
                      disabled={page <= 1}
                    >
                      Previous
                    </button>
                    <span>Page {page} of {pagination.pages}</span>
                    <button
                      type="button"
                      onClick={() => setPage((current) => current + 1)}
                      disabled={page >= pagination.pages}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </section>
        </section>

        <p className="job-board-company-link">
          Looking to hire? <Link to="/account">Manage your company profile</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}

export default JobBoard;
