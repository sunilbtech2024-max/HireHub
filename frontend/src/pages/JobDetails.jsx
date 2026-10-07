import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "../services/api";
import ApplyForm from "../components/ApplyForm";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import statusLabels from "../utils/applicationStatus";
import { useAuth } from "../context/useAuth";
import "../jobs.css";
import "../applications.css";

function JobDetails() {
  const { id } = useParams();
  const location = useLocation();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [job, setJob] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [application, setApplication] = useState(null);
  const [isCheckingApplication, setIsCheckingApplication] = useState(false);
  const [applicationQueryKey, setApplicationQueryKey] = useState("");
  const [applicationKey, setApplicationKey] = useState("");
  const [applicationLookupError, setApplicationLookupError] = useState("");
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadJob = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/jobs/${id}`, { signal: controller.signal });
        setJob(data.data);
      } catch (requestError) {
        if (requestError.code === "ERR_CANCELED") return;
        setError(
          requestError.response?.data?.message ||
            (requestError.request
              ? "Unable to reach HireHub. Check your connection and try again."
              : "We could not load this opportunity.")
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadJob();
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (isAuthLoading || !job || !isAuthenticated || user?.role !== "student") {
      return undefined;
    }

    const controller = new AbortController();
    const queryKey = `${user._id}:${job._id}`;
    const loadExistingApplication = async () => {
      setIsCheckingApplication(true);
      setApplicationQueryKey(queryKey);
      setApplicationLookupError("");
      try {
        const { data } = await api.get("/applications/mine", {
          params: { jobId: job._id, limit: 1 },
          signal: controller.signal,
        });
        setApplication(data.data[0] || null);
        setApplicationKey(queryKey);
      } catch (requestError) {
        if (requestError.code === "ERR_CANCELED") return;
        setApplicationLookupError(
          requestError.response?.data?.message ||
            (requestError.request
              ? "We could not check whether you have already applied. Check your connection and retry."
              : "We could not check your application status.")
        );
      } finally {
        if (!controller.signal.aborted) setIsCheckingApplication(false);
      }
    };

    loadExistingApplication();
    return () => controller.abort();
  }, [isAuthLoading, isAuthenticated, job, user?._id, user?.role]);

  const handleApplicationSubmitted = (submittedApplication, message) => {
    setApplication(submittedApplication);
    setApplicationKey(`${user._id}:${job._id}`);
    setShowApplyForm(false);
    setApplicationMessage(message || "Application submitted successfully.");
  };

  const currentApplicationKey = user?._id && job?._id
    ? `${user._id}:${job._id}`
    : "";
  const isCheckingCurrentApplication =
    isCheckingApplication && applicationQueryKey === currentApplicationKey;

  return (
    <>
      <Navbar />
      <main className="job-detail-page">
        <Link className="job-back-link" to={job?.type === "internship" ? "/internships" : "/jobs"}>
          ← Back to opportunities
        </Link>
        {isLoading && <p className="job-board-message" role="status">Loading opportunity…</p>}
        {!isLoading && error && (
          <section className="job-board-message job-board-error" role="alert">
            <h1>Opportunity unavailable</h1>
            <p>{error}</p>
            <Link to="/jobs" className="job-details-link">Browse opportunities</Link>
          </section>
        )}
        {!isLoading && !error && job && (
          <article className="job-detail-card">
            <header className="job-detail-header">
              <div>
                <p className="job-board-eyebrow">
                  {job.type === "internship" ? "INTERNSHIP" : "JOB"}
                </p>
                <h1>{job.title}</h1>
                <p className="job-detail-company">
                  {job.companyId?.companyName || "Company"}
                  {job.companyId?.industry && ` · ${job.companyId.industry}`}
                </p>
              </div>
              <span className="job-type-label">{job.workMode}</span>
            </header>

            <dl className="job-detail-facts">
              <div><dt>Location</dt><dd>{job.location}</dd></div>
              <div><dt>Experience</dt><dd>{job.experience || "Not specified"}</dd></div>
              <div>
                <dt>{job.type === "internship" ? "Stipend" : "Salary"}</dt>
                <dd>{(job.type === "internship" ? job.stipend : job.salary) || "Not specified"}</dd>
              </div>
              <div><dt>Positions</dt><dd>{job.vacancies}</dd></div>
              <div>
                <dt>Application deadline</dt>
                <dd>{job.deadline ? new Date(job.deadline).toLocaleDateString() : "Not specified"}</dd>
              </div>
              <div><dt>Posted</dt><dd>{new Date(job.createdAt).toLocaleDateString()}</dd></div>
            </dl>

            <section className="job-detail-section">
              <h2>About the opportunity</h2>
              <p>{job.description}</p>
            </section>
            {job.responsibilities?.length > 0 && (
              <section className="job-detail-section">
                <h2>Responsibilities</h2>
                <ul>{job.responsibilities.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
              </section>
            )}
            {job.requirements?.length > 0 && (
              <section className="job-detail-section">
                <h2>Requirements</h2>
                <ul>{job.requirements.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
              </section>
            )}
            {job.skillsRequired?.length > 0 && (
              <section className="job-detail-section">
                <h2>Required skills</h2>
                <ul className="job-listing-skills">
                  {job.skillsRequired.map((skill) => <li key={skill}>{skill}</li>)}
                </ul>
              </section>
            )}
            {job.educationRequired && (
              <section className="job-detail-section">
                <h2>Education</h2>
                <p>{job.educationRequired}</p>
              </section>
            )}
            {!isAuthLoading && (!isAuthenticated || user?.role === "student") && (
              <section className="job-detail-section job-apply-section">
                {isCheckingCurrentApplication && (
                  <p role="status">Checking your application status…</p>
                )}
                {isAuthenticated &&
                  applicationKey === currentApplicationKey &&
                  !isCheckingCurrentApplication &&
                  !applicationLookupError &&
                  application && (
                  <div className="job-applied-panel" role="status">
                    <span>
                      Application status:{" "}
                      <strong>{statusLabels[application.status] || application.status}</strong>
                    </span>
                    <Link to={`/applications/${application._id}`}>View application</Link>
                  </div>
                )}
                {!isCheckingCurrentApplication &&
                  (applicationLookupError || !application || applicationKey !== currentApplicationKey) && (
                  <>
                    {applicationMessage && (
                      <p className="application-success" role="status">{applicationMessage}</p>
                    )}
                    {isAuthenticated ? (
                      <>
                        {applicationLookupError && (
                          <div className="application-error" role="alert">
                            <p>{applicationLookupError}</p>
                            <button
                              type="button"
                              className="application-secondary-button"
                              onClick={() => setJob((current) => current && { ...current })}
                            >
                              Retry
                            </button>
                          </div>
                        )}
                        {!showApplyForm && !applicationLookupError && (
                          <button
                            type="button"
                            className="application-primary-button"
                            onClick={() => setShowApplyForm(true)}
                          >
                            Apply Now
                          </button>
                        )}
                        {showApplyForm && !applicationLookupError && (
                          <ApplyForm
                            job={job}
                            onApplied={handleApplicationSubmitted}
                            onCancel={() => setShowApplyForm(false)}
                          />
                        )}
                      </>
                    ) : (
                      <Link
                        className="application-primary-button"
                        to="/login"
                        state={{ from: { pathname: location.pathname } }}
                      >
                        Login to Apply
                      </Link>
                    )}
                  </>
                )}
              </section>
            )}
          </article>
        )}
      </main>
      <Footer />
    </>
  );
}

export default JobDetails;
