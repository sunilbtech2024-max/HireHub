const nodemailer = require("nodemailer");

// Only the variable NAMES are ever surfaced in errors/logs, never their values.
const REQUIRED_SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REDACTED_KEYS = ["SMTP_PASS", "SMTP_USER"];

function createSmtpError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// Remove mailbox addresses and SMTP credentials from any text we log or return.
function redact(text) {
  let output = String(text ?? "");

  for (const key of REDACTED_KEYS) {
    const secret = String(process.env[key] ?? "").trim();
    if (secret.length > 2) {
      output = output.split(secret).join("[redacted]");
    }
  }

  return output.replace(EMAIL_PATTERN, "[email]").replace(/\s+/g, " ").trim();
}

function readSmtpConfig() {
  const missing = REQUIRED_SMTP_KEYS.filter(
    (key) => !String(process.env[key] ?? "").trim()
  );

  if (missing.length) {
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

function toSafeTransportError(error) {
  return createSmtpError(
    redact(error?.message) || "Unable to send the verification email.",
    error?.code || "EMAIL_SEND_FAILED",
    {
      command: redact(error?.command),
      responseCode: error?.responseCode || null,
    }
  );
}

async function sendOtpEmail(email, otp) {
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
  });

  try {
    return await transporter.sendMail({
      from: config.from,
      to: email,
      subject: "Verify your HireHub email",
      text: `Your HireHub verification code is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2>Verify your HireHub email</h2>
          <p>Use this code to complete your registration:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p>
          <p>This code expires in 10 minutes. Do not share it with anyone.</p>
          <p>If you did not request this code, you can ignore this email.</p>
        </div>
      `,
    });
  } catch (error) {
    throw toSafeTransportError(error);
  } finally {
    transporter.close();
  }
}

module.exports = { sendOtpEmail, redact };
