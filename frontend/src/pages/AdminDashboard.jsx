import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";
import "../admin-dashboard.css";

const listLimit = 8;

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
};

const statusText = (status) =>
  status ? status.replaceAll("_", " ") : "Unavailable";

function AdminPagination({ page, total, onChange }) {
  const pages = Math.ceil(total / listLimit);
  if (pages < 2) return null;
  return (
    <nav className="admin-pagination" aria-label="Table pagination">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span>Page {page} of {pages}</span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages}>
        Next
      </button>
    </nav>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({});
  const [roleFilter, setRoleFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("pending");
  const [usersPage, setUsersPage] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);
  const [jobsPage, setJobsPage] = useState(1);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const loadDashboard = useCallback(async (signal) => {
    setLoading(true);
    setErrors({});
    const requests = [
      ["overview", () => api.get("/admin/dashboard", { signal }), setDashboard, (data) => data.data],
      [
        "users",
        () => api.get("/admin/users", { params: { page: usersPage, limit: listLimit, role: roleFilter || undefined }, signal }),
        setUsers,
        (data) => data.data || [],
      ],
      [
        "companies",
        () => api.get("/admin/companies", { params: { page: companiesPage, limit: listLimit, status: companyFilter || undefined }, signal }),
        setCompanies,
        (data) => data.data || [],
      ],
      [
        "jobs",
        () => api.get("/admin/jobs", { params: { page: jobsPage, limit: listLimit }, signal }),
        setJobs,
        (data) => data.data || [],
      ],
    ];
    const results = await Promise.allSettled(requests.map(([, request]) => request()));
    if (signal.aborted) return;

    const nextErrors = {};
    results.forEach((result, index) => {
      const [key, , setter, selectData] = requests[index];
      if (result.status === "fulfilled") {
        const data = result.value.data;
        setter(selectData(data));
        if (key !== "overview") {
          setCounts((current) => ({
            ...current,
            [key]: result.value.data.pagination?.total ?? 0,
          }));
        }
      } else {
        nextErrors[key] = apiErrorMessage(
          result.reason,
          `We could not load ${key === "overview" ? "platform statistics" : key}.`
        );
      }
    });
    setErrors(nextErrors);
    setLoading(false);
  }, [companyFilter, companiesPage, jobsPage, roleFilter, usersPage]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadDashboard(controller.signal));
    return () => controller.abort();
  }, [loadDashboard, refreshCount]);

  const reviewCompany = async (company, status) => {
    if (
      status === "rejected" &&
      !window.confirm(`Reject verification for ${company.companyName}?`)
    ) {
      return;
    }
    setReviewingId(String(company._id));
    setReviewError("");
    setReviewSuccess("");
    try {
      await api.patch(`/admin/companies/${company._id}/verification`, { status });
      setReviewSuccess(`${company.companyName} verification ${status}.`);
      setRefreshCount((count) => count + 1);
    } catch (error) {
      setReviewError(apiErrorMessage(error, "We could not update company verification."));
    } finally {
      setReviewingId("");
    }
  };

  const stats = dashboard?.stats || {};
  const statCards = [
    ["Total users", stats.totalUsers],
    ["Students", stats.totalStudents],
    ["Companies", stats.totalCompanies],
    ["Jobs", stats.totalJobs],
    ["Internships", stats.totalInternships],
    ["Active listings", stats.activeListings],
    ["Applications", stats.totalApplications],
    ["Pending verifications", stats.pendingCompanyVerifications],
  ];

  return (
    <>
      <Navbar />
      <main className="admin-dashboard">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-dashboard-eyebrow">PLATFORM ADMINISTRATION</p>
            <h1>Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
            <p>Review platform activity and manage HireHub accounts.</p>
          </div>
          <button
            type="button"
            className="admin-refresh-button"
            onClick={() => setRefreshCount((count) => count + 1)}
            disabled={loading}
          >
            Refresh data
          </button>
        </header>

        <nav className="admin-quick-actions" aria-label="Admin quick actions">
          <a href="#admin-users">Manage users</a>
          <a href="#admin-companies">Verify companies</a>
          <a href="#admin-jobs">Manage jobs</a>
          <a href="#admin-applications">View applications</a>
        </nav>

        {reviewError && <p className="admin-alert admin-alert-error" role="alert">{reviewError}</p>}
        {reviewSuccess && <p className="admin-alert admin-alert-success" role="status">{reviewSuccess}</p>}

        <section className="admin-overview" aria-labelledby="admin-overview-title">
          <div className="admin-section-heading">
            <div>
              <p className="admin-section-eyebrow">AT A GLANCE</p>
              <h2 id="admin-overview-title">Platform overview</h2>
            </div>
          </div>
          {errors.overview ? (
            <div className="admin-panel-state admin-panel-error" role="alert">
              <p>{errors.overview}</p>
              <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>Try again</button>
            </div>
          ) : (
            <div className="admin-stat-grid">
              {statCards.map(([label, value]) => (
                <article className="admin-stat-card" key={label}>
                  <span>{label}</span>
                  <strong aria-label={value === undefined ? `${label} unavailable` : undefined}>
                    {value === undefined ? "—" : value}
                  </strong>
                </article>
              ))}
            </div>
          )}
          {loading && !dashboard && <p className="admin-loading" role="status">Loading platform data…</p>}
        </section>

        <section className="admin-panel" id="admin-users" aria-labelledby="admin-users-title">
          <div className="admin-section-heading">
            <div>
              <p className="admin-section-eyebrow">ACCOUNTS</p>
              <h2 id="admin-users-title">User management</h2>
            </div>
            <label className="admin-filter">
              Filter role
              <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setUsersPage(1); }}>
                <option value="">All roles</option>
                <option value="student">Students</option>
                <option value="company">Companies</option>
                <option value="admin">Admins</option>
              </select>
            </label>
          </div>
          <p className="admin-list-count">
            {counts.users === undefined ? "Total unavailable" : `Showing up to ${listLimit} of ${counts.users} users`}
          </p>
          {errors.users ? (
            <div className="admin-panel-state admin-panel-error" role="alert">{errors.users}</div>
          ) : users.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account status</th><th>Joined</th></tr></thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item._id}>
                      <td>{item.name || "—"}</td>
                      <td>{item.email || "—"}</td>
                      <td><span className="admin-badge">{item.role || "—"}</span></td>
                      <td><span className={`admin-badge ${item.isActive ? "is-active" : "is-inactive"}`}>{item.isActive ? "Active" : "Disabled"}</span></td>
                      <td>{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-panel-state">{loading ? "Loading users…" : "No users found for this filter."}</div>
          )}
          {!errors.users && users.length > 0 && (
            <AdminPagination page={usersPage} total={counts.users || 0} onChange={setUsersPage} />
          )}
        </section>

        <section className="admin-panel" id="admin-companies" aria-labelledby="admin-companies-title">
          <div className="admin-section-heading">
            <div>
              <p className="admin-section-eyebrow">ORGANIZATIONS</p>
              <h2 id="admin-companies-title">Company verification</h2>
            </div>
            <label className="admin-filter">
              Verification status
              <select value={companyFilter} onChange={(event) => { setCompanyFilter(event.target.value); setCompaniesPage(1); }}>
                <option value="pending">Pending</option>
                <option value="">All companies</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          <p className="admin-list-count">
            {counts.companies === undefined ? "Total unavailable" : `Showing up to ${listLimit} of ${counts.companies} companies`}
          </p>
          {errors.companies ? (
            <div className="admin-panel-state admin-panel-error" role="alert">{errors.companies}</div>
          ) : companies.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Company</th><th>Account contact</th><th>Industry</th><th>Status</th><th>Requested</th><th>Review</th></tr></thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company._id}>
                      <td>{company.companyName || "—"}</td>
                      <td>{company.userId?.name || company.userId?.email || "—"}</td>
                      <td>{company.industry || "—"}</td>
                      <td><span className={`admin-badge verification-${company.verificationStatus || "unknown"}`}>{statusText(company.verificationStatus)}</span></td>
                      <td>{formatDate(company.verificationRequestedAt)}</td>
                      <td>
                        {company.verificationStatus === "pending" ? (
                          <div className="admin-review-actions">
                            <button type="button" onClick={() => reviewCompany(company, "verified")} disabled={Boolean(reviewingId)} aria-label={`Approve ${company.companyName}`}>
                              {reviewingId === String(company._id) ? "Saving…" : "Approve"}
                            </button>
                            <button type="button" className="admin-reject-button" onClick={() => reviewCompany(company, "rejected")} disabled={Boolean(reviewingId)} aria-label={`Reject ${company.companyName}`}>
                              Reject
                            </button>
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-panel-state">
              {loading ? "Loading companies…" : companyFilter === "pending" ? "No companies are waiting for verification." : "No companies found."}
            </div>
          )}
          {!errors.companies && companies.length > 0 && (
            <AdminPagination page={companiesPage} total={counts.companies || 0} onChange={setCompaniesPage} />
          )}
        </section>

        <section className="admin-panel" id="admin-jobs" aria-labelledby="admin-jobs-title">
          <div className="admin-section-heading">
            <div>
              <p className="admin-section-eyebrow">LISTINGS</p>
              <h2 id="admin-jobs-title">Jobs and internships</h2>
            </div>
            <Link to="/jobs" className="admin-text-link">Browse public listings</Link>
          </div>
          <p className="admin-list-count">
            {counts.jobs === undefined ? "Total unavailable" : `Showing up to ${listLimit} of ${counts.jobs} listings`}
          </p>
          {errors.jobs ? (
            <div className="admin-panel-state admin-panel-error" role="alert">{errors.jobs}</div>
          ) : jobs.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Title</th><th>Company</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job._id}>
                      <td>{job.title || "—"}</td>
                      <td>{job.companyId?.companyName || "—"}</td>
                      <td>{job.type === "internship" ? "Internship" : "Job"}</td>
                      <td><span className={`admin-badge listing-${job.status || "unknown"}`}>{statusText(job.status)}</span></td>
                      <td>{formatDate(job.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-panel-state">{loading ? "Loading listings…" : "No jobs or internships have been posted."}</div>
          )}
          {!errors.jobs && jobs.length > 0 && (
            <AdminPagination page={jobsPage} total={counts.jobs || 0} onChange={setJobsPage} />
          )}
        </section>

        <section className="admin-panel" id="admin-applications" aria-labelledby="admin-applications-title">
          <div className="admin-section-heading">
            <div>
              <p className="admin-section-eyebrow">HIRING ACTIVITY</p>
              <h2 id="admin-applications-title">Application overview</h2>
            </div>
          </div>
          {errors.overview ? (
            <div className="admin-panel-state admin-panel-error" role="alert">{errors.overview}</div>
          ) : dashboard ? (
            <div className="admin-application-statuses">
              {Object.entries(dashboard.applicationStatuses || {}).length ? (
                Object.entries(dashboard.applicationStatuses).map(([status, count]) => (
                  <article className="admin-status-card" key={status}>
                    <span>{statusText(status)}</span>
                    <strong>{count}</strong>
                  </article>
                ))
              ) : (
                <div className="admin-panel-state">No applications have been submitted.</div>
              )}
            </div>
          ) : (
            <div className="admin-panel-state">{loading ? "Loading application counts…" : "Application statistics are unavailable."}</div>
          )}
          <p className="admin-privacy-note">This summary contains application counts only; it does not expose candidate resumes or cover letters.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}

export default AdminDashboard;
