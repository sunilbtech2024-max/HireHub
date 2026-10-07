import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { dashboardPathForRole } from "../utils/dashboardPath";

function getErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check that the backend is running and try again.";
  }
  return "We could not create your account. Please try again.";
}

function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    companyName: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data = await register(form);
      navigate(dashboardPathForRole(data.user.role), { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-card">

        <div className="auth-header">
          <div className="brand-mark">H</div>

          <h1>Create Your Account</h1>

          <p>
            Start your career journey with HireHub.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          <div className="form-group">
            <label htmlFor="register-name">
              Full Name
            </label>

            <input
              type="text"
              id="register-name"
              name="name"
              placeholder="Enter your full name"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-email">
              Email
            </label>

            <input
              type="email"
              id="register-email"
              name="email"
              placeholder="Enter your email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-password">
              Password
            </label>

            <input
              type="password"
              id="register-password"
              name="password"
              placeholder="Create a password"
              autoComplete="new-password"
              minLength={6}
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-role">I am joining as</label>
            <select
              id="register-role"
              name="role"
              value={form.role}
              onChange={handleChange}
            >
              <option value="student">Student / Job Seeker</option>
              <option value="company">Company / Recruiter</option>
            </select>
          </div>

          {form.role === "company" && (
            <div className="form-group">
              <label htmlFor="company-name">Company name</label>
              <input
                type="text"
                id="company-name"
                name="companyName"
                placeholder="Enter your company name"
                value={form.companyName}
                onChange={handleChange}
              />
            </div>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>

        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link to="/login">
            Login
          </Link>
        </p>

      </div>

    </div>
  );
}

export default Register;