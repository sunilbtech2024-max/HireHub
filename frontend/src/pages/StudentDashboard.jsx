import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ApplicationCard from "../components/ApplicationCard";
import Footer from "../components/Footer";
import JobCard from "../components/JobCard";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";
import "../applications.css";
import "../dashboard.css";
import "../jobs.css";

const applicationLimit = 3;

const hasProfileValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.values(value).some(hasProfileValue);
  }
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
};

const getProfileCompletion = (user) => {
  const fields = ["name", "email", "phone", "headline", "bio", "location", "skills", "education", "experience"];
  const completed = fields.filter((field) => hasProfileValue(user?.[field])).length;
  return { completed, total: fields.length, percent: Math.round((completed / fields.length) * 100) };
};

function StudentDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState({
    resume: undefined,
    analysis: undefined,
    recommendations: undefined,
    applications: undefined,
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const profileCompletion = getProfileCompletion(user);

  const loadDashboard = useCallback(async (signal) => {
    setIsLoading(true);
    setErrors({});
    const endpoints = [
      ["resume", () => api.get("/resumes/mine", { signal })],
      ["analysis", () => api.get("/ai/resume/analysis", { signal })],
      ["recommendations", () => api.get("/ai/jobs/recommended", { signal })],
      ["applications", () => api.get("/applications/mine", {
        params: { page: 1, limit: applicationLimit },
        signal,
      })],
    ];
    const results = await Promise.allSettled(
      endpoints.map(([, request]) => request())
    );
    if (signal.aborted) return;

    const nextDashboard = {};
    const nextErrors = {};
    results.forEach((result, index) => {
      const [key] = endpoints[index];
      if (result.status === "fulfilled") {
        nextDashboard[key] = result.value.data.data;
        return;
      }

      const requestError = result.reason;
      if (requestError.code === "ERR_CANCELED") return;
      if (requestError.response?.status === 404) {
        nextDashboard[key] = key === "applications" || key === "recommendations" ? [] : null;
        return;
      }
      nextErrors[key] = apiErrorMessage(
        requestError,
        `We could not load your ${key === "analysis" ? "resume analysis" : key}.`
      );
    });

    setDashboard(nextDashboard);
    setErrors(nextErrors);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadDashboard(controller.signal));
    return () => controller.abort();
  }, [loadDashboard, refreshCount]);

  const retry = () => setRefreshCount((count) => count + 1);
  const resume = dashboard.resume;
  const analysis = dashboard.analysis;
  const recommendations = dashboard.recommendations;
  const applications = dashboard.applications;

  return (
    <>
      <Navbar />
      <main className="student-dashboard">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">STUDENT WORKSPACE</p>
            <h1>Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
            <p>Keep your profile, resume, and job search moving forward.</p>
          </div>
          <Link className="dashboard-secondary-action" to="/account">Edit profile</Link>
        </header>

        {!isLoading && Object.keys(errors).length > 0 && (
          <div className="dashboard-load-error" role="alert">
            <p>Some dashboard information could not be loaded. Other sections may still be available.</p>
            <button type="button" onClick={retry}>Retry</button>
          </div>
        )}

        <div className="dashboard-overview-grid">
          <section className="dashboard-panel dashboard-profile-panel" aria-labelledby="dashboard-profile-title">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-section-label">PROFILE</p>
                <h2 id="dashboard-profile-title">Profile completion</h2>
              </div>
              <Link to="/account">Update</Link>
            </div>
            <div
              className="dashboard-progress-track"
              role="progressbar"
              aria-label="Profile completion"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={profileCompletion.percent}
            >
              <span style={{ width: `${profileCompletion.percent}%` }} />
            </div>
            <p className="dashboard-progress-copy">
              {profileCompletion.percent}% complete · {profileCompletion.completed} of {profileCompletion.total} profile details added
            </p>
            <div className="dashboard-profile-facts">
              <span>{user?.headline || "Add a professional headline"}</span>
              <span>{user?.location || "Add your location"}</span>
              <span>{user?.skills?.length || 0} profile skills</span>
            </div>
          </section>

          <section className="dashboard-panel dashboard-resume-panel" aria-labelledby="dashboard-resume-title">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-section-label">RESUME</p>
                <h2 id="dashboard-resume-title">Resume status</h2>
              </div>
              {resume && <span className="dashboard-status-pill">Uploaded</span>}
            </div>
            {isLoading && dashboard.resume === undefined ? (
              <p className="dashboard-muted" role="status">Loading resume status…</p>
            ) : errors.resume ? (
              <p className="dashboard-inline-error" role="alert">{errors.resume}</p>
            ) : resume ? (
              <>
                <p className="dashboard-resume-name">{resume.originalName}</p>
                <p className="dashboard-muted">
                  Updated {new Date(resume.updatedAt || resume.uploadedAt).toLocaleDateString()}
                </p>
                <Link className="dashboard-text-link" to="/ai-tools/resume-analyzer">Manage resume</Link>
              </>
            ) : (
              <>
                <p className="dashboard-muted">No resume uploaded yet. Add a PDF to get started.</p>
                <Link className="dashboard-text-link" to="/ai-tools/resume-analyzer">Upload resume</Link>
              </>
            )}
          </section>
        </div>

        <section className="dashboard-panel dashboard-analysis-panel" aria-labelledby="dashboard-analysis-title">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-label">AI RESUME INSIGHTS</p>
              <h2 id="dashboard-analysis-title">Resume analysis</h2>
            </div>
            {analysis && <Link to="/ai-tools/resume-analyzer">View full analysis</Link>}
          </div>
          {isLoading && dashboard.analysis === undefined ? (
            <p className="dashboard-muted" role="status">Loading analysis…</p>
          ) : errors.analysis ? (
            <p className="dashboard-inline-error" role="alert">{errors.analysis}</p>
          ) : !resume ? (
            <div className="dashboard-empty-inline">
              <p>Upload a resume before starting an AI analysis.</p>
              <Link to="/ai-tools/resume-analyzer">Upload resume</Link>
            </div>
          ) : !analysis ? (
            <div className="dashboard-empty-inline">
              <p>Your resume is uploaded, but it has not been analyzed yet.</p>
              <Link to="/ai-tools/resume-analyzer">Analyze resume</Link>
            </div>
          ) : (
            <>
              <p className="dashboard-analysis-summary">{analysis.summary}</p>
              <div className="dashboard-insight-grid">
                <div>
                  <h3>Top skills</h3>
                  {analysis.technicalSkills?.length || analysis.skills?.length ? (
                    <ul className="dashboard-skill-list">
                      {[...new Set([...(analysis.technicalSkills || []), ...(analysis.skills || [])])]
                        .slice(0, 8)
                        .map((skill) => <li key={skill}>{skill}</li>)}
                    </ul>
                  ) : <p className="dashboard-muted">No skills were identified.</p>}
                </div>
                <div>
                  <h3>Skill gaps</h3>
                  {analysis.missingSkills?.length ? (
                    <ul className="dashboard-gap-list">
                      {analysis.missingSkills.slice(0, 5).map((skill) => <li key={skill}>{skill}</li>)}
                    </ul>
                  ) : <p className="dashboard-muted">No specific skill gaps were identified.</p>}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="dashboard-panel dashboard-content-panel" aria-labelledby="dashboard-jobs-title">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-label">FOR YOU</p>
              <h2 id="dashboard-jobs-title">Recommended jobs</h2>
            </div>
            <Link to="/jobs">Browse jobs</Link>
          </div>
          {isLoading && dashboard.recommendations === undefined ? (
            <p className="dashboard-muted" role="status">Loading recommendations…</p>
          ) : errors.recommendations ? (
            <p className="dashboard-inline-error" role="alert">{errors.recommendations}</p>
          ) : !resume ? (
            <p className="dashboard-muted">Upload and analyze your resume to see skill-based recommendations.</p>
          ) : !analysis ? (
            <p className="dashboard-muted">Analyze your resume to see skill-based recommendations.</p>
          ) : recommendations?.length ? (
            <div className="job-results-list dashboard-job-list">
              {recommendations.slice(0, 3).map((job) => <JobCard key={job._id} job={job} />)}
            </div>
          ) : (
            <p className="dashboard-muted">No recommended active jobs are available right now.</p>
          )}
        </section>

        <section className="dashboard-panel dashboard-content-panel" aria-labelledby="dashboard-applications-title">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-label">YOUR ACTIVITY</p>
              <h2 id="dashboard-applications-title">Recent applications</h2>
            </div>
            <Link to="/applications">View all applications</Link>
          </div>
          {isLoading && dashboard.applications === undefined ? (
            <p className="dashboard-muted" role="status">Loading applications…</p>
          ) : errors.applications ? (
            <p className="dashboard-inline-error" role="alert">{errors.applications}</p>
          ) : applications?.length ? (
            <div className="application-card-list dashboard-application-list">
              {applications.slice(0, applicationLimit).map((application) => (
                <ApplicationCard application={application} key={application._id} />
              ))}
            </div>
          ) : (
            <div className="dashboard-empty-inline">
              <p>You have no applications yet.</p>
              <Link to="/jobs">Browse jobs</Link>
            </div>
          )}
        </section>

        <nav className="dashboard-quick-actions" aria-label="Quick actions">
          <Link to="/ai-tools/resume-analyzer">Upload / update resume</Link>
          <Link to="/ai-tools/resume-analyzer">View AI analysis</Link>
          <Link to="/jobs">Browse jobs</Link>
          <Link to="/applications">My applications</Link>
        </nav>

        {isLoading && (
          <p className="dashboard-loading-note" role="status">Updating your dashboard…</p>
        )}
      </main>
      <Footer />
    </>
  );
}

export default StudentDashboard;
