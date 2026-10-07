import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import MyJobs from "../components/MyJobs";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";
import statusLabels from "../utils/applicationStatus";
import "../applications.css";
import "../company-dashboard.css";

const emptyListing = (type) => ({
  title: "",
  type,
  description: "",
  skillsRequired: "",
  location: "",
  workMode: "onsite",
  experience: "",
  educationRequired: "",
  status: "draft",
});

function CompanyDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [postingType, setPostingType] = useState("");
  const [listing, setListing] = useState(() => emptyListing("job"));
  const [postError, setPostError] = useState("");
  const [postSuccess, setPostSuccess] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  const loadDashboard = useCallback(async (signal) => {
    setIsLoading(true);
    setError("");
    try {
      const response = await api.get("/applications/company/dashboard", { signal });
      if (!signal.aborted) setDashboard(response.data.data);
    } catch (requestError) {
      if (requestError.code === "ERR_CANCELED") return;
      if (!signal.aborted) {
        setError(apiErrorMessage(requestError, "We could not load the company dashboard."));
      }
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadDashboard(controller.signal));
    return () => controller.abort();
  }, [loadDashboard, refreshCount]);

  const openPostingForm = (type) => {
    setListing(emptyListing(type));
    setPostError("");
    setPostSuccess("");
    setPostingType(type);
  };

  const closePostingForm = () => {
    if (isPosting) return;
    setPostingType("");
    setPostError("");
  };

  const updateListing = (event) => {
    const { name, value } = event.target;
    setListing((current) => ({ ...current, [name]: value }));
  };

  const submitListing = async (event) => {
    event.preventDefault();
    setPostError("");
    setPostSuccess("");
    setIsPosting(true);
    try {
      await api.post("/jobs", {
        ...listing,
        skillsRequired: listing.skillsRequired
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
      setPostSuccess(
        listing.status === "active"
          ? "Your listing has been published."
          : "Your draft has been saved."
      );
      setPostingType("");
      setRefreshCount((count) => count + 1);
    } catch (requestError) {
      setPostError(apiErrorMessage(requestError, "We could not save this listing."));
    } finally {
      setIsPosting(false);
    }
  };

  const company = dashboard?.company;
  const stats = dashboard?.stats;

  return (
    <>
      <Navbar />
      <main className="company-dashboard">
        <header className="company-dashboard-header">
          <div className="company-dashboard-identity">
            {company?.logo ? (
              <img src={company.logo} alt="" className="company-dashboard-logo" />
            ) : (
              <span className="company-dashboard-logo company-dashboard-initial" aria-hidden="true">
                {(company?.companyName || "C").charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="company-dashboard-eyebrow">COMPANY WORKSPACE</p>
              <h1>Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
              <p>{company?.companyName || "Manage your company hiring activity."}</p>
            </div>
          </div>
          <Link className="company-dashboard-secondary-action" to="/account">
            Company profile
          </Link>
        </header>

        {isLoading && !dashboard && (
          <p className="company-dashboard-state" role="status">Loading your company dashboard…</p>
        )}
        {!isLoading && error && (
          <section className="company-dashboard-state company-dashboard-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>
              Try again
            </button>
          </section>
        )}

        {dashboard && (
          <>
            <section className={`company-verification-notice ${company.verified ? "is-verified" : "needs-verification"}`} aria-label="Company verification status">
              <div>
                <strong>{company.verified ? "Company verified" : "Company verification required"}</strong>
                <p>
                  {company.verified
                    ? "Your organization can publish active listings."
                    : `Verification status: ${company.verificationStatus}. You can save drafts while your company is unverified.`}
                </p>
              </div>
              <Link to="/account">View verification</Link>
            </section>

            <section className="company-dashboard-stats" aria-label="Hiring overview">
              <article className="company-stat-card">
                <span>Total listings</span>
                <strong>{stats.totalJobs}</strong>
              </article>
              <article className="company-stat-card">
                <span>Active listings</span>
                <strong>{stats.activeJobs}</strong>
              </article>
              <article className="company-stat-card">
                <span>Draft listings</span>
                <strong>{stats.draftJobs}</strong>
              </article>
              <article className="company-stat-card">
                <span>Total applications</span>
                <strong>{stats.totalApplications}</strong>
              </article>
            </section>

            {postSuccess && <p className="company-dashboard-success" role="status">{postSuccess}</p>}
            {postError && <p className="company-dashboard-inline-error" role="alert">{postError}</p>}

            <nav className="company-dashboard-quick-actions" aria-label="Company quick actions">
              <button type="button" className="company-action-primary" onClick={() => openPostingForm("job")}>
                Post a job
              </button>
              <button type="button" onClick={() => openPostingForm("internship")}>
                Post an internship
              </button>
              <Link to="/account#my-jobs-heading">Manage my jobs</Link>
              <a href="#company-recent-applicants">View applicants</a>
            </nav>

            {postingType && (
              <section className="company-dashboard-panel company-listing-form-panel" aria-labelledby="company-listing-form-title">
                <div className="company-dashboard-panel-heading">
                  <div>
                    <p className="company-dashboard-section-label">NEW LISTING</p>
                    <h2 id="company-listing-form-title">
                      Post {postingType === "internship" ? "an internship" : "a job"}
                    </h2>
                  </div>
                  <button type="button" className="company-form-close" onClick={closePostingForm} disabled={isPosting}>
                    Cancel
                  </button>
                </div>
                <form className="company-listing-form" onSubmit={submitListing}>
                  <label>
                    Listing title
                    <input name="title" value={listing.title} onChange={updateListing} maxLength={160} required />
                  </label>
                  <label>
                    Location
                    <input name="location" value={listing.location} onChange={updateListing} maxLength={160} required />
                  </label>
                  <label>
                    Work mode
                    <select name="workMode" value={listing.workMode} onChange={updateListing}>
                      <option value="onsite">On-site</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="remote">Remote</option>
                    </select>
                  </label>
                  <label>
                    Experience
                    <input name="experience" value={listing.experience} onChange={updateListing} maxLength={120} placeholder="e.g. Entry level" />
                  </label>
                  <label className="company-listing-wide">
                    Required skills
                    <input name="skillsRequired" value={listing.skillsRequired} onChange={updateListing} placeholder="React, JavaScript, Node.js" required />
                    <span>Separate skills with commas.</span>
                  </label>
                  <label className="company-listing-wide">
                    Education requirement
                    <input name="educationRequired" value={listing.educationRequired} onChange={updateListing} maxLength={300} />
                  </label>
                  <label className="company-listing-wide">
                    Description
                    <textarea name="description" value={listing.description} onChange={updateListing} maxLength={10000} rows={5} required />
                  </label>
                  <label className="company-listing-wide">
                    Save as
                    <select name="status" value={listing.status} onChange={updateListing}>
                      <option value="draft">Draft</option>
                      {company.verified && <option value="active">Publish as active</option>}
                    </select>
                    {!company.verified && (
                      <span>Active publishing is available after your company is verified.</span>
                    )}
                  </label>
                  {postError && <p className="company-dashboard-inline-error company-listing-wide" role="alert">{postError}</p>}
                  <div className="company-listing-actions company-listing-wide">
                    <button type="button" onClick={closePostingForm} disabled={isPosting}>Cancel</button>
                    <button type="submit" className="company-action-primary" disabled={isPosting}>
                      {isPosting ? "Saving listing…" : listing.status === "active" ? "Publish listing" : "Save draft"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            <div className="company-dashboard-columns">
              <section className="company-dashboard-panel company-dashboard-recent-jobs" aria-labelledby="company-recent-jobs-title">
                <div className="company-dashboard-panel-heading">
                  <div>
                    <p className="company-dashboard-section-label">LISTINGS</p>
                    <h2 id="company-recent-jobs-title">Recent jobs and internships</h2>
                  </div>
                  <Link to="/account#my-jobs-heading">Manage all</Link>
                </div>
                {isLoading ? (
                  <p className="company-dashboard-muted" role="status">Refreshing listings…</p>
                ) : dashboard.recentJobs.length ? (
                  <div className="company-recent-job-list">
                    {dashboard.recentJobs.map((job) => (
                      <article className="company-recent-job" key={job._id}>
                        <div className="company-recent-job-main">
                          <div>
                            <h3>{job.title}</h3>
                            <p>{job.type === "internship" ? "Internship" : "Job"} · {job.location}</p>
                          </div>
                          <span className={`company-listing-status listing-${job.status}`}>{job.status}</span>
                        </div>
                        <div className="company-recent-job-footer">
                          <span>{job.applicantCount} {job.applicantCount === 1 ? "application" : "applications"}</span>
                          <Link to={`/company/jobs/${job._id}/applications`}>View applicants</Link>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="company-dashboard-empty">
                    <p>You have not posted any jobs or internships yet.</p>
                    <button type="button" onClick={() => openPostingForm("job")}>Create your first listing</button>
                  </div>
                )}
              </section>

              <section className="company-dashboard-panel company-dashboard-recent-applicants" id="company-recent-applicants" aria-labelledby="company-recent-applicants-title">
                <div className="company-dashboard-panel-heading">
                  <div>
                    <p className="company-dashboard-section-label">CANDIDATES</p>
                    <h2 id="company-recent-applicants-title">Recent applicants</h2>
                  </div>
                </div>
                {isLoading ? (
                  <p className="company-dashboard-muted" role="status">Refreshing applicants…</p>
                ) : dashboard.recentApplicants.length ? (
                  <ul className="company-recent-applicant-list">
                    {dashboard.recentApplicants.map((application) => (
                      <li className="company-recent-applicant" key={application._id}>
                        <div className="company-applicant-heading">
                          <div>
                            <h3>{application.studentId?.name || "Candidate"}</h3>
                            {application.studentId?.email && (
                              <a href={`mailto:${application.studentId.email}`}>{application.studentId.email}</a>
                            )}
                          </div>
                          <span className={`application-status-badge status-${application.status}`}>
                            {statusLabels[application.status] || application.status}
                          </span>
                        </div>
                        <p className="company-applicant-job">
                          {application.jobId?.title || "Listing unavailable"}
                          {application.jobId?.type && ` · ${application.jobId.type === "internship" ? "Internship" : "Job"}`}
                        </p>
                        <div className="company-applicant-footer">
                          <time dateTime={application.appliedAt}>
                            Applied {new Date(application.appliedAt).toLocaleDateString()}
                          </time>
                          <Link to={`/applications/${application._id}`}>View application</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="company-dashboard-muted">No applicants yet. New applications will appear here.</p>
                )}
              </section>
            </div>

            <section id="company-all-jobs" className="company-dashboard-my-jobs" aria-label="All company job listings">
              <MyJobs key={refreshCount} />
            </section>

            <section className="company-dashboard-profile" aria-labelledby="company-dashboard-profile-title">
              <div className="company-dashboard-panel-heading">
                <div>
                  <p className="company-dashboard-section-label">COMPANY PROFILE</p>
                  <h2 id="company-dashboard-profile-title">{company.companyName}</h2>
                </div>
                <Link to="/account">Edit profile</Link>
              </div>
              <dl className="company-profile-details">
                <div><dt>Industry</dt><dd>{company.industry || "Not specified"}</dd></div>
                <div><dt>Location</dt><dd>{company.location || "Not specified"}</dd></div>
                <div><dt>Company size</dt><dd>{company.companySize || "Not specified"}</dd></div>
                <div><dt>Website</dt><dd>{company.website || "Not specified"}</dd></div>
              </dl>
              {company.description && <p className="company-dashboard-description">{company.description}</p>}
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

export default CompanyDashboard;
