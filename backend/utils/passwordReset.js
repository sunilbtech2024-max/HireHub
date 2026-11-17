const crypto = require("crypto");

// Shared time/limit constants so the model, controller and tests cannot drift.
const OTP_TTL_MS = 10 * 60 * 1000; // OTP valid for 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // one request per email per minute
const MAX_OTP_ATTEMPTS = 5; // verification attempts per OTP request
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // reset authorization valid 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5; // persistent per-email request ceiling
const REQUEST_WINDOW_MS = 60 * 60 * 1000; // ...measured over one hour
const OTP_PEPPER_MIN_LENGTH = 32;
const RESET_TOKEN_BYTES = 32; // 256 bits -> 64 hex characters
const MAX_PASSWORD_BYTES = 72; // bcrypt truncates beyond 72 bytes

const OTP_PATTERN = /^\d{6}$/;
const HEX_PATTERN = /^[0-9a-f]+$/i;

function createResetError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// The pepper is a dedicated secret. We never fall back to JWT_SECRET, because a
// fallback would silently weaken OTP hashes if JWT_SECRET is ever rotated.
function getOtpPepper() {
  const pepper = process.env.OTP_PEPPER;

  if (typeof pepper !== "string" || pepper.trim().length === 0) {
    throw createResetError(
      "Password reset is unavailable: OTP_PEPPER is not configured.",
      "OTP_PEPPER_MISSING"
    );
  }

  if (pepper.length < OTP_PEPPER_MIN_LENGTH) {
    throw createResetError(
      `Password reset is unavailable: OTP_PEPPER must be at least ${OTP_PEPPER_MIN_LENGTH} characters.`,
      "OTP_PEPPER_WEAK"
    );
  }

  // Used verbatim: trimming would change the secret on one environment only.
  return pepper;
}

// Cryptographically secure 6-digit code (100000-999999, no leading zero).
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  if (typeof otp !== "string" || !OTP_PATTERN.test(otp)) {
    throw createResetError(
      "A 6-digit verification code is required.",
      "OTP_INVALID_FORMAT"
    );
  }

  const pepper = getOtpPepper();

  // HMAC-SHA256: a leaked database alone cannot brute-force the 10^6 space
  // without the server-side pepper.
  return crypto.createHmac("sha256", pepper).update(otp).digest("hex");
}

// Length-guarded constant-time comparison for hex digests.
function safeCompareHex(expected, submitted) {
  if (typeof expected !== "string" || typeof submitted !== "string") return false;
  if (expected.length !== submitted.length) return false;
  if (expected.length === 0 || expected.length % 2 !== 0) return false;
  if (!HEX_PATTERN.test(expected) || !HEX_PATTERN.test(submitted)) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(submitted, "hex")
    );
  } catch {
    return false;
  }
}

// Opaque bearer for step 3. 256 bits of entropy means it cannot be guessed and
// does not need a pepper; it is only ever stored as a SHA-256 digest.
function generateResetToken() {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
}

function hashResetToken(token) {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length % 2 !== 0 ||
    !HEX_PATTERN.test(token)
  ) {
    throw createResetError("Invalid reset token.", "RESET_TOKEN_INVALID");
  }

  return crypto.createHash("sha256").update(token).digest("hex");
}

// Safe for logs: hides the local part and the full domain.
// "student@example.com" -> "***@ex***.com"
function maskEmail(email) {
  if (typeof email !== "string") return "[email]";

  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");

  if (at <= 0 || at === trimmed.length - 1) return "[email]";

  const domain = trimmed.slice(at + 1);
  const labels = domain.split(".");
  const tld = labels.length > 1 ? labels[labels.length - 1] : "";
  const domainHead = labels[0].slice(0, 2);

  return `***@${domainHead}***${tld ? `.${tld}` : ""}`;
}

// bcrypt silently ignores bytes past 72, so longer passwords would create a
// false sense of strength and mismatched hashes across libraries.
function isPasswordWithinByteLimit(password) {
  return (
    typeof password === "string" &&
    Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES
  );
}

module.exports = {
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  MAX_OTP_ATTEMPTS,
  RESET_TOKEN_TTL_MS,
  MAX_REQUESTS_PER_WINDOW,
  REQUEST_WINDOW_MS,
  OTP_PEPPER_MIN_LENGTH,
  RESET_TOKEN_BYTES,
  MAX_PASSWORD_BYTES,
  getOtpPepper,
  generateOtp,
  hashOtp,
  safeCompareHex,
  generateResetToken,
  hashResetToken,
  maskEmail,
  isPasswordWithinByteLimit,
};
