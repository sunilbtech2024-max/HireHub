const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");

const nodemailerPath = require.resolve("nodemailer");
const modulePath = require.resolve("../utils/sendOtpEmail");

const state = {
  transportOptions: null,
  sentMessage: null,
  sendError: null,
  closeCalls: 0,
  messageCount: 0,
};

// Replace nodemailer so this suite never opens a real SMTP connection.
require.cache[nodemailerPath] = {
  id: nodemailerPath,
  filename: nodemailerPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {
    createTransport: (options) => {
      state.transportOptions = options;

      return {
        async sendMail(message) {
          if (state.sendError) throw state.sendError;
          state.messageCount += 1;
          state.sentMessage = message;
          return { messageId: "test-message-id", accepted: [message.to], rejected: [] };
        },
        close() {
          state.closeCalls += 1;
        },
      };
    },
  },
};

delete require.cache[modulePath];
const { sendOtpEmail, redact } = require(modulePath);

const baselineEnv = {
  SMTP_HOST: "smtp.relay.test",
  SMTP_PORT: "587",
  SMTP_USER: "mailer@hirehub.test",
  SMTP_PASS: "unit-test-secret-value",
  SMTP_FROM: "no-reply@hirehub.test",
};

const originalEnv = {};

beforeEach(() => {
  for (const [key, value] of Object.entries(baselineEnv)) {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  }

  state.transportOptions = null;
  state.sentMessage = null;
  state.sendError = null;
  state.closeCalls = 0;
  state.messageCount = 0;
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("missing SMTP configuration fails with variable names only", async () => {
  delete process.env.SMTP_FROM;

  await assert.rejects(
    () => sendOtpEmail("student@example.com", "123456"),
    (error) => {
      assert.equal(error.code, "SMTP_CONFIG_INCOMPLETE");
      assert.deepEqual(error.missingKeys, ["SMTP_FROM"]);
      assert.match(error.message, /SMTP_FROM/);
      assert.doesNotMatch(error.message, /@/);
      assert.equal(state.messageCount, 0);
      return true;
    }
  );
});

test("non-numeric SMTP_PORT is rejected without leaking values", async () => {
  process.env.SMTP_PORT = "not-a-port";

  await assert.rejects(
    () => sendOtpEmail("student@example.com", "123456"),
    (error) => {
      assert.equal(error.code, "SMTP_CONFIG_INVALID");
      assert.doesNotMatch(error.message, /not-a-port/);
      assert.equal(state.messageCount, 0);
      return true;
    }
  );
});

test("SMTP failures are rethrown with credentials and addresses redacted", async () => {
  state.sendError = Object.assign(
    new Error(
      `Invalid login: 535 Authentication failed for ${baselineEnv.SMTP_USER} using ${baselineEnv.SMTP_PASS}`
    ),
    { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" }
  );

  await assert.rejects(
    () => sendOtpEmail("student@example.com", "123456"),
    (error) => {
      assert.equal(error.code, "EAUTH");
      assert.equal(error.responseCode, 535);
      assert.equal(error.command, "AUTH PLAIN");
      assert.ok(!error.message.includes(baselineEnv.SMTP_PASS));
      assert.ok(!error.message.includes(baselineEnv.SMTP_USER));
      assert.doesNotMatch(error.message, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      assert.equal(state.closeCalls, 1);
      return true;
    }
  );
});

test("successful send uses STARTTLS on port 587 and closes the transport", async () => {
  const info = await sendOtpEmail("student@example.com", "123456");

  assert.equal(info.messageId, "test-message-id");
  assert.equal(state.transportOptions.host, baselineEnv.SMTP_HOST);
  assert.equal(state.transportOptions.port, 587);
  assert.equal(state.transportOptions.secure, false);
  assert.equal(state.transportOptions.requireTLS, true);
  assert.equal(state.transportOptions.connectionTimeout, 15_000);
  assert.equal(state.sentMessage.from, baselineEnv.SMTP_FROM);
  assert.equal(state.sentMessage.to, "student@example.com");
  assert.equal(state.closeCalls, 1);
});

test("port 465 uses implicit TLS", async () => {
  process.env.SMTP_PORT = "465";

  await sendOtpEmail("student@example.com", "123456");

  assert.equal(state.transportOptions.port, 465);
  assert.equal(state.transportOptions.secure, true);
  assert.equal(state.transportOptions.requireTLS, false);
});

test("redact removes addresses and configured secrets", () => {
  const output = redact(
    `login ${baselineEnv.SMTP_USER} / ${baselineEnv.SMTP_PASS} to student@example.com`
  );

  assert.ok(!output.includes(baselineEnv.SMTP_USER));
  assert.ok(!output.includes(baselineEnv.SMTP_PASS));
  assert.doesNotMatch(output, /student@example\.com/);
});
