const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { afterEach, beforeEach, test } = require("node:test");

// ---------------------------------------------------------------------------
// Nodemailer stub: these tests must never open a real SMTP connection.
// ---------------------------------------------------------------------------
const nodemailerPath = require.resolve("nodemailer");

const state = {
  transportOptions: null,
  transportCalls: 0,
  messageCount: 0,
  sentMessage: null,
  sendError: null,
  closeCalls: 0,
};

require.cache[nodemailerPath] = {
  id: nodemailerPath,
  filename: nodemailerPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {
    createTransport: (options) => {
      state.transportOptions = options;
      state.transportCalls += 1;

      return {
        async sendMail(message) {
          if (state.sendError) throw state.sendError;
          state.messageCount += 1;
          state.sentMessage = message;
          return {
            messageId: "test-message-id",
            accepted: [message.to],
            rejected: [],
          };
        },
        close() {
          state.closeCalls += 1;
        },
      };
    },
  },
};

const {
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  MAX_OTP_ATTEMPTS,
  RESET_TOKEN_TTL_MS,
  MAX_REQUESTS_PER_WINDOW,
  REQUEST_WINDOW_MS,
  OTP_PEPPER_MIN_LENGTH,
  MAX_PASSWORD_BYTES,
  generateOtp,
  hashOtp,
  safeCompareHex,
  generateResetToken,
  hashResetToken,
  maskEmail,
  isPasswordWithinByteLimit,
} = require("../utils/passwordReset");

const { sendPasswordResetEmail } = require("../utils/sendPasswordResetEmail");
const PasswordReset = require("../models/PasswordReset");

// ---------------------------------------------------------------------------
// Environment isolation
// ---------------------------------------------------------------------------
const BASELINE_PEPPER = crypto.randomBytes(32).toString("hex");

const baselineEnv = {
  SMTP_HOST: "smtp.relay.test",
  SMTP_PORT: "587",
  SMTP_USER: "mailer@hirehub.test",
  SMTP_PASS: "unit-test-secret-value",
  SMTP_FROM: "no-reply@hirehub.test",
  OTP_PEPPER: BASELINE_PEPPER,
};

const originalEnv = {};
for (const key of Object.keys(baselineEnv)) {
  originalEnv[key] = process.env[key];
}

beforeEach(() => {
  for (const [key, value] of Object.entries(baselineEnv)) {
    process.env[key] = value;
  }

  state.transportOptions = null;
  state.transportCalls = 0;
  state.messageCount = 0;
  state.sentMessage = null;
  state.sendError = null;
  state.closeCalls = 0;
});

afterEach(() => {
  for (const key of Object.keys(baselineEnv)) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

function captureConsole() {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };
  const calls = [];

  for (const key of Object.keys(original)) {
    console[key] = (...args) => calls.push([key, args]);
  }

  return {
    calls,
    restore: () => Object.assign(console, original),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
test("reset limits match the approved policy", () => {
  assert.equal(OTP_TTL_MS, 600000, "OTP must expire after 10 minutes");
  assert.equal(RESET_TOKEN_TTL_MS, 600000, "reset token must expire after 10 minutes");
  assert.equal(OTP_RESEND_COOLDOWN_MS, 60000);
  assert.equal(MAX_OTP_ATTEMPTS, 5);
  assert.equal(MAX_REQUESTS_PER_WINDOW, 5);
  assert.equal(REQUEST_WINDOW_MS, 3600000);
  assert.equal(OTP_PEPPER_MIN_LENGTH, 32);
  assert.equal(MAX_PASSWORD_BYTES, 72);
});

// ---------------------------------------------------------------------------
// OTP generation and hashing
// ---------------------------------------------------------------------------
test("generateOtp always returns a secure 6-digit code", () => {
  const seen = new Set();

  for (let index = 0; index < 200; index += 1) {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/);
    const value = Number(otp);
    assert.ok(value >= 100000 && value <= 999999, `out of range: ${otp}`);
    seen.add(otp);
  }

  assert.ok(seen.size > 1, "OTP generator must not be constant");
});

test("hashOtp is deterministic HMAC-SHA256 with the configured pepper", () => {
  const first = hashOtp("123456");
  const second = hashOtp("123456");

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, "123456");
});

test("hashOtp changes when the pepper changes", () => {
  const first = hashOtp("123456");
  process.env.OTP_PEPPER = crypto.randomBytes(32).toString("hex");
  const second = hashOtp("123456");

  assert.notEqual(first, second);
});

test("hashOtp rejects malformed codes without echoing them", () => {
  for (const value of ["12345", "1234567", "12ab56", "", null, undefined, 123456]) {
    assert.throws(
      () => hashOtp(value),
      (error) =>
        error.code === "OTP_INVALID_FORMAT" &&
        error.message === "A 6-digit verification code is required."
    );
  }
});

test("missing OTP_PEPPER fails safely and never falls back to JWT_SECRET", () => {
  delete process.env.OTP_PEPPER;
  process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");

  assert.throws(
    () => hashOtp("123456"),
    (error) =>
      error.code === "OTP_PEPPER_MISSING" &&
      /OTP_PEPPER/.test(error.message) &&
      !error.message.includes(process.env.JWT_SECRET)
  );
});

test("blank or whitespace-only OTP_PEPPER is treated as missing", () => {
  for (const value of ["", "   ", "\t\n"]) {
    process.env.OTP_PEPPER = value;
    assert.throws(() => hashOtp("123456"), (error) => error.code === "OTP_PEPPER_MISSING");
  }
});

test("weak OTP_PEPPER below 32 characters is rejected", () => {
  process.env.OTP_PEPPER = "a".repeat(31);
  assert.throws(() => hashOtp("123456"), (error) => error.code === "OTP_PEPPER_WEAK");

  process.env.OTP_PEPPER = "a".repeat(32);
  assert.doesNotThrow(() => hashOtp("123456"));
});

// ---------------------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------------------
test("safeCompareHex matches equal digests and rejects everything else", () => {
  const digest = crypto.createHash("sha256").update("value").digest("hex");

  assert.equal(safeCompareHex(digest, digest), true);
  assert.equal(safeCompareHex(digest, digest.toUpperCase()), true);
  assert.equal(
    safeCompareHex(digest, crypto.createHash("sha256").update("other").digest("hex")),
    false
  );
  assert.equal(safeCompareHex(digest, digest.slice(0, 32)), false);
  assert.equal(safeCompareHex(digest, `${digest}00`), false);
  assert.equal(safeCompareHex("zz", "zz"), false);
  assert.equal(safeCompareHex("abc", "abc"), false);
  assert.equal(safeCompareHex(null, digest), false);
  assert.equal(safeCompareHex(digest, undefined), false);
  assert.equal(safeCompareHex("", ""), false);
});

test("safeCompareHex never throws on hostile input", () => {
  const digest = crypto.createHash("sha256").update("value").digest("hex");

  for (const value of [123, {}, [], true, "0x1234", "-1", "gg"]) {
    assert.doesNotThrow(() => safeCompareHex(digest, value));
    assert.equal(safeCompareHex(digest, value), false);
  }
});

// ---------------------------------------------------------------------------
// Reset token
// ---------------------------------------------------------------------------
test("generateResetToken returns unique 256-bit opaque tokens", () => {
  const first = generateResetToken();
  const second = generateResetToken();

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test("hashResetToken is a deterministic digest that differs from the token", () => {
  const token = generateResetToken();
  const hash = hashResetToken(token);

  assert.equal(hash, hashResetToken(token));
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
});

test("hashResetToken rejects empty, odd-length and non-hex values", () => {
  for (const value of ["", "abc", "zz", null, undefined, 42]) {
    assert.throws(
      () => hashResetToken(value),
      (error) => error.code === "RESET_TOKEN_INVALID"
    );
  }
});

// ---------------------------------------------------------------------------
// Log helpers and password policy
// ---------------------------------------------------------------------------
test("maskEmail hides the local part and the full domain", () => {
  const masked = maskEmail("student@example.com");

  assert.equal(masked, "***@ex***.com");
  assert.ok(!masked.includes("student"));
  assert.ok(!masked.includes("example"));

  assert.equal(maskEmail("not-an-email"), "[email]");
  assert.equal(maskEmail("@example.com"), "[email]");
  assert.equal(maskEmail("student@"), "[email]");
  assert.equal(maskEmail(null), "[email]");
});

test("isPasswordWithinByteLimit enforces the 72-byte bcrypt ceiling", () => {
  assert.equal(isPasswordWithinByteLimit("a".repeat(72)), true);
  assert.equal(isPasswordWithinByteLimit("a".repeat(73)), false);
  assert.equal(isPasswordWithinByteLimit("€".repeat(24)), true); // 3 bytes each
  assert.equal(isPasswordWithinByteLimit("€".repeat(25)), false);
  assert.equal(isPasswordWithinByteLimit("😀".repeat(18)), true); // 4 bytes each
  assert.equal(isPasswordWithinByteLimit("😀".repeat(19)), false);
  assert.equal(isPasswordWithinByteLimit(""), true);
  assert.equal(isPasswordWithinByteLimit(null), false);
  assert.equal(isPasswordWithinByteLimit(123456), false);
});

// ---------------------------------------------------------------------------
// PasswordReset model
// ---------------------------------------------------------------------------
const makeDoc = (overrides = {}) =>
  new PasswordReset({
    email: "student@example.com",
    otpHash: "a".repeat(64),
    ...overrides,
  });

test("PasswordReset schema declares every required lifecycle field", () => {
  const paths = PasswordReset.schema.paths;

  for (const field of [
    "email",
    "otpHash",
    "otpExpiresAt",
    "attempts",
    "lastOtpSentAt",
    "requestCount",
    "requestWindowStart",
    "resetTokenHash",
    "resetTokenExpiresAt",
    "consumedAt",
    "createdAt",
    "updatedAt",
  ]) {
    assert.ok(paths[field], `missing schema path: ${field}`);
  }
});

test("PasswordReset stores no plaintext OTP, token or password", () => {
  const paths = PasswordReset.schema.paths;

  assert.equal(paths.otp, undefined);
  assert.equal(paths.resetToken, undefined);
  assert.equal(paths.password, undefined);
  assert.equal(paths.otpHash.options.select, false);
  assert.equal(paths.resetTokenHash.options.select, false);
});

test("PasswordReset email is unique, lowercase and trimmed", () => {
  const options = PasswordReset.schema.paths.email.options;

  assert.equal(options.unique, true);
  assert.equal(options.lowercase, true);
  assert.equal(options.trim, true);
  // Mongoose normalizes required: [true, "message"] into that exact array.
  assert.equal(Array.isArray(options.required) ? options.required[0] : options.required, true);

  const doc = makeDoc({ email: "  Student@Example.COM " });
  assert.equal(doc.email, "student@example.com");
});

test("PasswordReset has a TTL safety net on otpExpiresAt", () => {
  const ttlIndex = PasswordReset.schema
    .indexes()
    .find(([fields]) => fields && fields.otpExpiresAt === 1);

  assert.ok(ttlIndex, "expected a TTL index on otpExpiresAt");
  assert.equal(ttlIndex[1].expireAfterSeconds, 3600);
});

test("PasswordReset defaults are safe before any reset is requested", () => {
  const doc = makeDoc();

  assert.equal(doc.attempts, 0);
  assert.equal(doc.requestCount, 0);
  assert.equal(doc.resetTokenHash, null);
  assert.equal(doc.resetTokenExpiresAt, null);
  assert.equal(doc.consumedAt, null);

  const ttl = doc.otpExpiresAt.getTime() - Date.now();
  assert.ok(ttl > 9 * 60 * 1000 && ttl <= 10 * 60 * 1000 + 1000);
});

test("PasswordReset toJSON never serializes stored hashes", () => {
  const json = makeDoc({
    resetTokenHash: "b".repeat(64),
    resetTokenExpiresAt: new Date(Date.now() + 60000),
  }).toJSON();

  assert.equal(Object.hasOwn(json, "otpHash"), false);
  assert.equal(Object.hasOwn(json, "resetTokenHash"), false);
  assert.equal(json.email, "student@example.com");
});

test("PasswordReset expiry helpers are strict and null-safe", () => {
  const future = makeDoc({ otpExpiresAt: new Date(Date.now() + 60000) });
  assert.equal(future.isOtpExpired(), false);

  future.otpExpiresAt = new Date(Date.now() - 1000);
  assert.equal(future.isOtpExpired(), true);

  const unset = makeDoc();
  unset.otpExpiresAt = undefined;
  assert.equal(unset.isOtpExpired(), true);

  const tokenDoc = makeDoc();
  assert.equal(tokenDoc.isResetTokenExpired(), true);

  tokenDoc.resetTokenExpiresAt = new Date(Date.now() + 60000);
  assert.equal(tokenDoc.isResetTokenExpired(), false);

  tokenDoc.resetTokenExpiresAt = new Date(Date.now() - 1000);
  assert.equal(tokenDoc.isResetTokenExpired(), true);
});

test("PasswordReset attempt cap and consumption flags behave as specified", () => {
  const doc = makeDoc();

  assert.equal(doc.hasExceededOtpAttempts(), false);

  doc.attempts = MAX_OTP_ATTEMPTS - 1;
  assert.equal(doc.hasExceededOtpAttempts(), false);

  doc.attempts = MAX_OTP_ATTEMPTS;
  assert.equal(doc.hasExceededOtpAttempts(), true);

  doc.attempts = MAX_OTP_ATTEMPTS + 3;
  assert.equal(doc.hasExceededOtpAttempts(), true);

  assert.equal(doc.isConsumed(), false);
  doc.consumedAt = new Date();
  assert.equal(doc.isConsumed(), true);
});

// ---------------------------------------------------------------------------
// sendPasswordResetEmail
// ---------------------------------------------------------------------------
test("sendPasswordResetEmail delivers the code with the existing SMTP settings", async () => {
  const info = await sendPasswordResetEmail("student@example.com", "123456");

  assert.equal(info.messageId, "test-message-id");
  assert.equal(state.transportCalls, 1);
  assert.equal(state.messageCount, 1);
  assert.equal(state.closeCalls, 1);

  assert.equal(state.sentMessage.to, "student@example.com");
  assert.equal(state.sentMessage.from, "no-reply@hirehub.test");
  assert.match(state.sentMessage.subject, /Reset your HireHub password/i);
  assert.match(state.sentMessage.text, /123456/);
  assert.match(state.sentMessage.html, /123456/);
  assert.match(state.sentMessage.text, /10 minutes/i);
  assert.match(state.sentMessage.html, /10 minutes/i);
  assert.doesNotMatch(JSON.stringify(state.sentMessage), /unit-test-secret-value/);
});

test("sendPasswordResetEmail reuses the STARTTLS transport contract on port 587", async () => {
  await sendPasswordResetEmail("student@example.com", "123456");

  const options = state.transportOptions;

  assert.equal(options.host, "smtp.relay.test");
  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.auth.user, "mailer@hirehub.test");
  assert.equal(options.connectionTimeout, 15000);
  assert.equal(options.greetingTimeout, 15000);
  assert.equal(options.socketTimeout, 20000);
  assert.equal(options.logger, false);
  assert.equal(options.debug, false);
});

test("sendPasswordResetEmail switches to implicit TLS on port 465", async () => {
  process.env.SMTP_PORT = "465";

  await sendPasswordResetEmail("student@example.com", "123456");

  assert.equal(state.transportOptions.port, 465);
  assert.equal(state.transportOptions.secure, true);
  assert.equal(state.transportOptions.requireTLS, false);
});

test("sendPasswordResetEmail never sends a malformed code", async () => {
  for (const value of ["12345", "12ab56", "", null, 123456]) {
    await assert.rejects(
      sendPasswordResetEmail("student@example.com", value),
      (error) => error.code === "OTP_INVALID_FORMAT"
    );
  }

  assert.equal(state.transportCalls, 0);
  assert.equal(state.messageCount, 0);
});

test("SMTP failures are sanitized: no mailbox, credential or OTP leaks", async () => {
  state.sendError = Object.assign(
    new Error(
      "535 Auth failed for mailer@hirehub.test using unit-test-secret-value with code 123456"
    ),
    { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN unit-test-secret-value" }
  );

  let thrown;
  try {
    await sendPasswordResetEmail("student@example.com", "123456");
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, "expected the send to fail");
  assert.equal(thrown.code, "EAUTH");
  assert.equal(thrown.responseCode, 535);
  assert.doesNotMatch(thrown.message, /hirehub\.test/);
  assert.doesNotMatch(thrown.message, /unit-test-secret-value/);
  assert.doesNotMatch(thrown.message, /123456/);
  assert.match(thrown.message, /\[email\]|\[redacted\]/);
  assert.equal(state.closeCalls, 1, "transporter must always be closed");
});

test("missing SMTP configuration reports variable names only", async () => {
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    delete process.env[key];
  }

  let thrown;
  try {
    await sendPasswordResetEmail("student@example.com", "123456");
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown.code, "SMTP_CONFIG_INCOMPLETE");
  assert.deepEqual(thrown.missingKeys, [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ]);
  assert.match(thrown.message, /SMTP_HOST/);
  assert.doesNotMatch(thrown.message, /smtp\.relay\.test/);
  assert.equal(state.transportCalls, 0);
});

test("an invalid SMTP port is rejected before connecting", async () => {
  process.env.SMTP_PORT = "not-a-port";

  await assert.rejects(
    sendPasswordResetEmail("student@example.com", "123456"),
    (error) => error.code === "SMTP_CONFIG_INVALID"
  );

  assert.equal(state.transportCalls, 0);
});

test("sendPasswordResetEmail writes nothing to the console", async () => {
  const capture = captureConsole();

  try {
    await sendPasswordResetEmail("student@example.com", "123456");

    state.sendError = Object.assign(
      new Error("550 mailbox unavailable for student@example.com"),
      { code: "EENVELOPE", responseCode: 550 }
    );

    await assert.rejects(
      sendPasswordResetEmail("student@example.com", "654321"),
      (error) => error.code === "EENVELOPE"
    );
  } finally {
    capture.restore();
  }

  assert.deepEqual(capture.calls, []);
});
