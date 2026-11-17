const nodemailer = require("nodemailer");
const { redact } = require("./sendOtpEmail");

// This module deliberately duplicates the SMTP transport setup from
// sendOtpEmail.js instead of modifying the working registration OTP path.
// Only the redaction helper is shared (imported read-only).
const REQUIRED_SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const OTP_PATTERN = /^\d{6}$/;

function createSmtpError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function readSmtpConfig() {
  const missing = REQUIRED_SMTP_KEYS.filter(
    (key) => !String(process.env[key] ?? "").trim()
  );

  if (missing.length) {
    // Only variable NAMES are surfaced, never their values.
    throw createSmtpError(
      `Email service is not configured. Missing: ${missing.join(", ")}`,
      "SMTP_CONFIG_INCOMPLETE",
      { missingKeys: missing }
    );
  }

  const port = Number(process.env.SMTP_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw createSmtpError(
      "Email service is not configured. SMTP_PORT must be a valid port number.",
      "SMTP_CONFIG_INVALID",
      { missingKeys: ["SMTP_PORT"] }
    );
  }

  return {
    host: process.env.SMTP_HOST.trim(),
    port,
    secure: port === 465,
    user: process.env.SMTP_USER.trim(),
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM.trim(),
  };
}

// Removes mailbox addresses, SMTP credentials and the OTP itself from any text
// that could reach a log or a client response.
function sanitize(text, otp) {
  let output = redact(text);

  if (typeof otp === "string" && otp.length > 0) {
    output = output.split(otp).join("[otp]");
  }

  return output;
}

function toSafeTransportError(error, otp) {
  return createSmtpError(
    sanitize(error?.message, otp) || "Unable to send the password reset email.",
    error?.code || "EMAIL_SEND_FAILED",
    {
      command: sanitize(error?.command, otp),
      responseCode: error?.responseCode || null,
    }
  );
}

async function sendPasswordResetEmail(email, otp) {
  // Validate before reading config or opening a socket.
  if (typeof otp !== "string" || !OTP_PATTERN.test(otp)) {
    throw createSmtpError(
      "A valid 6-digit password reset code is required.",
      "OTP_INVALID_FORMAT"
    );
  }

  const config = readSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
  });

  try {
    return await transporter.sendMail({
      from: config.from,
      to: email,
      subject: "Reset your HireHub password",
      text: `Your HireHub password reset code is ${otp}. It expires in 10 minutes. Do not share this code with anyone. If you did not request a password reset, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2>Reset your HireHub password</h2>
          <p>Use this code to choose a new password:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p>
          <p>This code expires in 10 minutes. Do not share it with anyone.</p>
          <p>If you did not request a password reset, you can ignore this email. Your password will not change.</p>
        </div>
      `,
    });
  } catch (error) {
    throw toSafeTransportError(error, otp);
  } finally {
    transporter.close();
  }
}

module.exports = { sendPasswordResetEmail };
