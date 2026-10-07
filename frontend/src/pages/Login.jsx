import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { dashboardPathForRole } from "../utils/dashboardPath";

function getErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check that the backend is running and try again.";
  }
  return "We could not sign you in. Please try again.";
}

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
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
      const data = await login(form);
      navigate(location.state?.from?.pathname || dashboardPathForRole(data.user.role), { replace: true });
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

          <h1>Welcome Back</h1>

          <p>
            Login to continue your HireHub journey.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          <div className="form-group">
            <label htmlFor="login-email">
              Email
            </label>

            <input
              type="email"
              id="login-email"
              name="email"
              placeholder="Enter your email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">
              Password
            </label>

            <input
              type="password"
              id="login-password"
              name="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>

        </form>

        <p className="auth-footer">
          Don't have an account?{" "}
          <Link to="/register">
            Create an account
          </Link>
        </p>

      </div>

    </div>
  );
}

export default Login;