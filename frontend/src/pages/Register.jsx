import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { dashboardPathForRole } from "../utils/dashboardPath";

const OTP_LENGTH = 6;
const REDIRECT_DELAY_MS = 700;

function getErrorMessage(error, fallback) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check that the backend is running and try again.";
  }
  return fallback;
}

function Register() {
  const { register, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("details");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    companyName: "",
  });
  const [otp, setOtp] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleOtpChange = (event) => {
    setOtp(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH));
  };

  const handleRequestOtp = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const data = await register(form);
      const email = data.email || form.email.trim().toLowerCase();

      setRegisteredEmail(email);
      setOtp("");
      setStep("otp");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We could not create your account. Please try again."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    if (isSubmitting || isRedirecting) return;

    setError("");
    setStatus("");

    const code = otp.trim();
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await verifyOtp({ email: registeredEmail, otp: code });

      if (!data?.user?.role) {
        throw new Error("Verified response did not include a user role.");
      }

      setStatus("Email verified. Redirecting to your dashboard...");
      setIsRedirecting(true);

      window.setTimeout(() => {
        navigate(dashboardPathForRole(data.user.role), { replace: true });
      }, REDIRECT_DELAY_MS);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We could not verify that code. Please try again."
        )
      );
      setIsSubmitting(false);
    }
  };

  const handleUseDifferentEmail = () => {
    if (isSubmitting || isRedirecting) return;

    setStep("details");
    setOtp("");
    setError("");
    setStatus("");
  };

  return (
    <div className="auth-page">

      <div className="auth-card">

        <div className="auth-header">
          <div className="brand-mark">H</div>

          <h1>{step === "details" ? "Create Your Account" : "Verify Your Email"}</h1>

          <p>
            {step === "details"
              ? "Start your career journey with HireHub."
              : "Enter the verification code we emailed you to finish creating your account."}
          </p>
        </div>

        {step === "details" ? (
          <form className="auth-form" onSubmit={handleRequestOtp}>

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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  required
                />
              </div>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending code..." : "Send verification code"}
            </button>

          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifyOtp}>

            <p className="auth-hint">
              We sent a {OTP_LENGTH}-digit code to{" "}
              <strong>{registeredEmail}</strong>. It expires in 10 minutes.
              Check your spam folder if you do not see it.
            </p>

            <div className="form-group">
              <label htmlFor="register-otp">
                Verification code
              </label>

              <input
                type="text"
                id="register-otp"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={OTP_LENGTH}
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={handleOtpChange}
                disabled={isSubmitting || isRedirecting}
                autoFocus
                required
              />
            </div>

            {status && <p className="auth-success" role="status">{status}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={isSubmitting || isRedirecting}
            >
              {isRedirecting
                ? "Verified"
                : isSubmitting
                  ? "Verifying..."
                  : "Verify & Create Account"}
            </button>

            <button
              type="button"
              className="btn btn-light auth-submit"
              onClick={handleUseDifferentEmail}
              disabled={isSubmitting || isRedirecting}
            >
              Use a different email
            </button>

          </form>
        )}

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
