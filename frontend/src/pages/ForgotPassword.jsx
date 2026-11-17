import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_PASSWORD_BYTES = 72;
const REDIRECT_DELAY_MS = 1500;

const STEPS = [
  { key: "email", label: "Email" },
  { key: "otp", label: "Verify" },
  { key: "password", label: "New password" },
];

const STEP_ORDER = ["email", "otp", "password"];

function getErrorMessage(error, fallback) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check that the backend is running and try again.";
  }
  return fallback;
}

const utf8ByteLength = (value) => new TextEncoder().encode(value).length;

function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [passwords, setPasswords] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Resend countdown. Each tick reschedules itself; unmount clears the timer.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // D3: no auto-login. Send the user back to the login screen.
  useEffect(() => {
    if (step !== "done") return undefined;
    const timer = window.setTimeout(
      () => navigate("/login", { replace: true }),
      REDIRECT_DELAY_MS
    );
    return () => window.clearTimeout(timer);
  }, [step, navigate]);

  const normalizedEmail = email.trim().toLowerCase();

  const handlePasswordChange = (event) => {
    setPasswords((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleOtpChange = (event) => {
    setOtp(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH));
  };

  const requestCode = async () => {
    const { data } = await api.post("/auth/forgot-password", {
      email: normalizedEmail,
    });
    setCooldown(RESEND_COOLDOWN_SECONDS);
    return data;
  };

  const handleRequestCode = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const data = await requestCode();
      setEmail(normalizedEmail);
      setOtp("");
      setResetToken("");
      setStep("otp");
      setStatus(data.message || "");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We could not start the password reset. Please try again."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (isSubmitting || cooldown > 0) return;

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const data = await requestCode();
      setOtp("");
      setStatus(data.message || "A new code has been sent.");
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "We could not resend the code.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setStatus("");

    const code = otp.trim();

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const { data } = await api.post("/auth/verify-reset-otp", {
        email: normalizedEmail,
        otp: code,
      });

      if (typeof data.resetToken !== "string") {
        throw new Error("Verified response did not include a reset authorization.");
      }

      setResetToken(data.resetToken);
      setOtp("");
      setStep("password");
      setStatus("Code verified. It expires in 10 minutes.");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We could not verify that code. Please try again."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setStatus("");

    const { newPassword, confirmPassword } = passwords;

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (utf8ByteLength(newPassword) > MAX_PASSWORD_BYTES) {
      setError("Password is too long. The maximum is 72 bytes.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!resetToken) {
      setStep("email");
      setError("Your reset code has expired. Please start again.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data } = await api.post("/auth/reset-password", {
        email: normalizedEmail,
        resetToken,
        newPassword,
        confirmPassword,
      });

      setResetToken("");
      setPasswords({ newPassword: "", confirmPassword: "" });
      setStatus(data.message || "Password updated successfully.");
      setStep("done");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We could not update your password. Please start again."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartOver = () => {
    if (isSubmitting) return;
    setStep("email");
    setOtp("");
    setResetToken("");
    setPasswords({ newPassword: "", confirmPassword: "" });
    setError("");
    setStatus("");
    setCooldown(0);
  };

  const handleUseDifferentEmail = () => {
    if (isSubmitting) return;
    setStep("email");
    setOtp("");
    setResetToken("");
    setError("");
    setStatus("");
  };

  const titles = {
    email: "Forgot Password?",
    otp: "Check Your Email",
    password: "Set a New Password",
    done: "Password Updated",
  };

  const subtitles = {
    email:
      "Enter the email linked to your HireHub account. We will send a 6-digit reset code.",
    otp: `Enter the ${OTP_LENGTH}-digit code we sent to your email. It expires in 10 minutes.`,
    password:
      "Choose a new password. It will replace your old password immediately.",
    done: "Your password has been changed. Redirecting you to the login page...",
  };

  const activeIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-mark">H</div>
          <h1>{titles[step]}</h1>
          <p>{subtitles[step]}</p>
        </div>

        {step !== "done" && (
          <ol className="auth-steps" aria-label="Password reset progress">
            {STEPS.map((item, index) => (
              <li
                key={item.key}
                className={
                  index === activeIndex
                    ? "is-active"
                    : index < activeIndex
                      ? "is-complete"
                      : ""
                }
                aria-current={index === activeIndex ? "step" : undefined}
              >
                {item.label}
              </li>
            ))}
          </ol>
        )}

        {step === "email" && (
          <form className="auth-form" onSubmit={handleRequestCode}>
            <div className="form-group">
              <label htmlFor="forgot-email">Email</label>
              <input
                type="email"
                id="forgot-email"
                name="email"
                placeholder="Enter your registered email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending code..." : "Send reset code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form className="auth-form" onSubmit={handleVerifyOtp}>
            <p className="auth-hint">
              We sent a {OTP_LENGTH}-digit code to{" "}
              <strong>{normalizedEmail}</strong>. Check your spam folder if it
              does not arrive.
            </p>

            <div className="form-group">
              <label htmlFor="forgot-otp">Reset code</label>
              <input
                type="text"
                id="forgot-otp"
                name="otp"
                className="auth-otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={OTP_LENGTH}
                placeholder="000000"
                value={otp}
                onChange={handleOtpChange}
                disabled={isSubmitting}
                autoFocus
                required
              />
            </div>

            {status && (
              <p className="auth-success" role="status">
                {status}
              </p>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <div className="auth-actions">
              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Verifying..." : "Verify code"}
              </button>

              <button
                type="button"
                className="btn btn-light auth-submit"
                onClick={handleResendCode}
                disabled={isSubmitting || cooldown > 0}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>

              <button
                type="button"
                className="auth-text-button"
                onClick={handleUseDifferentEmail}
                disabled={isSubmitting}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <div className="form-group">
              <label htmlFor="forgot-new-password">New password</label>
              <input
                type="password"
                id="forgot-new-password"
                name="newPassword"
                placeholder="Create a new password"
                autoComplete="new-password"
                minLength={6}
                value={passwords.newPassword}
                onChange={handlePasswordChange}
                disabled={isSubmitting}
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="forgot-confirm-password">
                Confirm new password
              </label>
              <input
                type="password"
                id="forgot-confirm-password"
                name="confirmPassword"
                placeholder="Re-enter the new password"
                autoComplete="new-password"
                minLength={6}
                value={passwords.confirmPassword}
                onChange={handlePasswordChange}
                disabled={isSubmitting}
                required
              />
            </div>

            <p className="auth-hint">
              At least 6 characters. Maximum 72 bytes.
            </p>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <div className="auth-actions">
              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating password..." : "Reset password"}
              </button>

              <button
                type="button"
                className="auth-text-button"
                onClick={handleStartOver}
                disabled={isSubmitting}
              >
                Start over
              </button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="auth-form">
            {status && (
              <p className="auth-success" role="status">
                {status}
              </p>
            )}
            <Link
              to="/login"
              className="btn btn-primary auth-submit"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Go to login
            </Link>
          </div>
        )}

        <p className="auth-footer">
          Remembered your password? <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
