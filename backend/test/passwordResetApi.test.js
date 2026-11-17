const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { beforeEach, test } = require("node:test");

// ---------------------------------------------------------------------------
// In-memory fakes: no MongoDB, no SMTP, no network.
// ---------------------------------------------------------------------------
let sequence = 0;

const state = {
  record: null,
  userExists: true,
  user: null,
  lastUserQuery: null,
  sentEmails: [],
  sentOtp: null,
  sendError: null,
  saveCalls: 0,
  savedPassword: null,
  deleteCalls: 0,
  failClaim: false,
  findOneCalls: 0,
  userLookups: 0,
};

function makeRecord(data) {
  return Object.assign(
    {
      _id: `pr-${++sequence}`,
      email: "student@example.com",
      attempts: 0,
      requestCount: 1,
      requestWindowStart: new Date(),
      lastOtpSentAt: new Date(),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      consumedAt: null,
      isOtpExpired(now = Date.now()) {
        return !this.otpExpiresAt || this.otpExpiresAt.getTime() <= now;
      },
      isResetTokenExpired(now = Date.now()) {
        return !this.resetTokenExpiresAt || this.resetTokenExpiresAt.getTime() <= now;
      },
      hasExceededOtpAttempts() {
        return this.attempts >= 5;
      },
      isConsumed() {
        return Boolean(this.consumedAt);
      },
    },
    data
  );
}

function applyUpdate(record, update) {
  if (update.$set) Object.assign(record, update.$set);

  if (update.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) {
      record[key] = (record[key] || 0) + amount;
    }
  }
}

const FakePasswordReset = {
  findOne(filter) {
    state.findOneCalls += 1;
    const match =
      state.record && state.record.email === filter.email ? state.record : null;

    return {
      select: async () => match,
      then: (resolve, reject) => Promise.resolve(match).then(resolve, reject),
      catch: (reject) => Promise.resolve(match).catch(reject),
    };
  },

  async findOneAndUpdate(filter, update) {
    if (state.failClaim && update.$set?.consumedAt) return null;

    const record = state.record;

    if (!record) return null;
    if (filter._id && record._id !== filter._id) return null;

    if (filter.lastOtpSentAt?.$lte) {
      const cutoff = new Date(filter.lastOtpSentAt.$lte).getTime();
      if (
        !record.lastOtpSentAt ||
        new Date(record.lastOtpSentAt).getTime() > cutoff
      ) {
        return null;
      }
    }

    if (filter.consumedAt === null && record.consumedAt !== null) return null;

    if (filter.resetTokenExpiresAt?.$gt) {
      const limit = new Date(filter.resetTokenExpiresAt.$gt).getTime();
      if (
        !record.resetTokenExpiresAt ||
        new Date(record.resetTokenExpiresAt).getTime() <= limit
      ) {
        return null;
      }
    }

    applyUpdate(record, update);
    return record;
  },

  async create(data) {
    if (state.record && state.record.email === data.email) {
      const error = new Error("E11000 duplicate key error collection");
      error.code = 11000;
      throw error;
    }

    state.record = makeRecord({ ...data, _id: `pr-${++sequence}` });
    return state.record;
  },

  async updateOne(filter, update) {
    if (!state.record) return { modifiedCount: 0 };
    if (filter._id && state.record._id !== filter._id) {
      return { modifiedCount: 0 };
    }

    applyUpdate(state.record, update);
    return { modifiedCount: 1 };
  },

  async deleteOne(filter) {
    if (!state.record) return { deletedCount: 0 };
    if (filter._id && state.record._id !== filter._id) {
      return { deletedCount: 0 };
    }

    state.record = null;
    state.deleteCalls += 1;
    return { deletedCount: 1 };
  },
};

const FakeUser = {
  async exists(filter) {
    state.userLookups += 1;
    state.lastUserQuery = filter?.email ?? null;
    return state.userExists;
  },
  async findOne(filter) {
    state.lastUserQuery = filter?.email ?? null;
    return state.userExists ? state.user : null;
  },
};

const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
};

stubModule("../models/User", FakeUser);
stubModule("../models/PasswordReset", FakePasswordReset);
stubModule("../utils/sendPasswordResetEmail", {
  sendPasswordResetEmail: async (email, otp) => {
    if (state.sendError) throw state.sendError;
    state.sentEmails.push(email);
    state.sentOtp = otp;
    return { messageId: "test-message-id" };
  },
});

const {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} = require("../controllers/passwordResetController");
const passwordResetRoutes = require("../routes/passwordResetRoutes");
const {
  hashOtp,
  hashResetToken,
  generateResetToken,
} = require("../utils/passwordReset");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PEPPER = crypto.randomBytes(32).toString("hex");

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const forwardError = (error) => {
  if (error) throw error;
};

const request = (body) => ({ body });

const call = async (handler, body) => {
  const res = createResponse();
  await handler(request(body), res, forwardError);
  return res;
};

const seedRecord = (overrides = {}) =>
  (state.record = makeRecord({
    email: "student@example.com",
    otpHash: hashOtp("123456"),
    otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  }));

const seedResetToken = (token = generateResetToken(), overrides = {}) =>
  seedRecord({
    otpExpiresAt: new Date(Date.now() - 1000),
    resetTokenHash: hashResetToken(token),
    resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  });

const captureConsole = () => {
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

  return { calls, restore: () => Object.assign(console, original) };
};

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  process.env.OTP_PEPPER = PEPPER;

  state.record = null;
  state.userExists = true;
  state.lastUserQuery = null;
  state.sentEmails = [];
  state.sentOtp = null;
  state.sendError = null;
  state.saveCalls = 0;
  state.savedPassword = null;
  state.deleteCalls = 0;
  state.failClaim = false;
  state.findOneCalls = 0;
  state.userLookups = 0;
  sequence = 0;

  state.user = {
    _id: "user-1",
    email: "student@example.com",
    password: "old-bcrypt-hash",
    async save() {
      state.saveCalls += 1;
      state.savedPassword = this.password;
    },
  };
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
test("the three password reset routes are registered as POST", () => {
  for (const path of ["/forgot-password", "/verify-reset-otp", "/reset-password"]) {
    const layer = passwordResetRoutes.stack.find(
      (entry) => entry.route?.path === path && entry.route?.methods?.post
    );
    assert.ok(layer, `expected POST ${path} to be registered`);
  }
});

// ---------------------------------------------------------------------------
// POST /forgot-password
// ---------------------------------------------------------------------------
test("forgot-password stores only a hash and emails a 6-digit code", async () => {
  const res = await call(requestPasswordReset, { email: "Student@Example.com" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.message, /If this email is registered/);

  assert.equal(state.sentEmails.length, 1);
  assert.equal(state.sentEmails[0], "student@example.com");
  assert.match(state.sentOtp, /^\d{6}$/);

  const record = state.record;
  assert.equal(record.email, "student@example.com");
  assert.match(record.otpHash, /^[0-9a-f]{64}$/);
  assert.notEqual(record.otpHash, state.sentOtp);
  assert.equal(record.otpHash, hashOtp(state.sentOtp));
  assert.equal(record.attempts, 0);
  assert.equal(record.requestCount, 1);

  const ttl = record.otpExpiresAt.getTime() - Date.now();
  assert.ok(ttl > 9 * 60 * 1000 && ttl <= 10 * 60 * 1000 + 1000);
});

test("forgot-password is identical for unknown emails and sends nothing", async () => {
  const known = await call(requestPasswordReset, {
    email: "student@example.com",
  });
  const knownBody = known.body;

  state.record = null;
  state.sentEmails = [];
  state.sentOtp = null;
  state.userExists = false;

  const unknown = await call(requestPasswordReset, {
    email: "stranger@example.com",
  });

  assert.equal(unknown.statusCode, known.statusCode);
  assert.deepEqual(unknown.body, knownBody);
  assert.equal(state.sentEmails.length, 0);
  assert.equal(state.sentOtp, null);

  // A record is still written so cooldown/rate-limit behaviour is uniform.
  assert.ok(state.record, "expected a uniform throttling record");
  assert.equal(state.record.email, "stranger@example.com");
});

test("forgot-password never returns the OTP or a reset token", async () => {
  const res = await call(requestPasswordReset, { email: "student@example.com" });
  const serialized = JSON.stringify(res.body);

  assert.doesNotMatch(serialized, new RegExp(state.sentOtp));
  assert.doesNotMatch(serialized, /resetToken/);
  assert.doesNotMatch(serialized, new RegExp(state.record.otpHash));
});

test("forgot-password enforces the 60 second resend cooldown", async () => {
  const previousHash = "a".repeat(64);
  seedRecord({
    otpHash: previousHash,
    lastOtpSentAt: new Date(),
    attempts: 2,
  });

  const res = await call(requestPasswordReset, { email: "student@example.com" });

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.success, false);
  assert.equal(state.sentOtp, null);
  assert.equal(state.record.otpHash, previousHash, "hash must not be overwritten");
});

test("forgot-password enforces the hourly per-email request ceiling", async () => {
  seedRecord({
    requestCount: 5,
    requestWindowStart: new Date(),
    lastOtpSentAt: new Date(Date.now() - 5 * 60 * 1000),
  });

  const res = await call(requestPasswordReset, { email: "student@example.com" });

  assert.equal(res.statusCode, 429);
  assert.match(res.body.message, /Too many reset requests/);
  assert.ok(res.body.retryAfterSeconds > 0);
  assert.equal(state.sentOtp, null);
});

test("forgot-password resets the request window after an hour", async () => {
  seedRecord({
    requestCount: 5,
    requestWindowStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
    lastOtpSentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });

  const res = await call(requestPasswordReset, { email: "student@example.com" });

  assert.equal(res.statusCode, 200);
  assert.equal(state.record.requestCount, 1);
  assert.equal(state.sentEmails.length, 1);
});

test("resending never clears failed OTP attempts", async () => {
  seedRecord({
    attempts: 3,
    requestCount: 1,
    lastOtpSentAt: new Date(Date.now() - 2 * 60 * 1000),
  });

  const res = await call(requestPasswordReset, { email: "student@example.com" });

  assert.equal(res.statusCode, 200);
  assert.equal(state.record.attempts, 3, "attempts must survive a resend");
});

test("a new code invalidates any previously issued reset authorization", async () => {
  seedRecord({
    resetTokenHash: "b".repeat(64),
    resetTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    lastOtpSentAt: new Date(Date.now() - 2 * 60 * 1000),
  });

  const res = await call(requestPasswordReset, { email: "student@example.com" });

  assert.equal(res.statusCode, 200);
  assert.equal(state.record.resetTokenHash, null);
  assert.equal(state.record.resetTokenExpiresAt, null);
});

test("forgot-password rejects malformed email addresses without side effects", async () => {
  for (const email of ["not-an-email", "", "a@b", null, 42, undefined]) {
    const res = await call(requestPasswordReset, { email });
    assert.equal(res.statusCode, 400);
  }

  assert.equal(state.record, null);
  assert.equal(state.sentEmails.length, 0);
});

test("forgot-password fails safely when OTP_PEPPER is missing", async () => {
  delete process.env.OTP_PEPPER;

  const res = await call(requestPasswordReset, { email: "student@example.com" });

  assert.equal(res.statusCode, 503);
  assert.match(res.body.message, /temporarily unavailable/i);
  assert.doesNotMatch(res.body.message, /pepper|JWT/i);
  assert.equal(state.record, null);
  assert.equal(state.sentEmails.length, 0);
});

test("an email delivery failure still returns the generic response", async () => {
  state.sendError = Object.assign(
    new Error("550 mailbox unavailable for student@example.com"),
    { code: "EENVELOPE", responseCode: 550 }
  );

  const capture = captureConsole();
  let res;

  try {
    res = await call(requestPasswordReset, { email: "student@example.com" });
    await flushAsync();
  } finally {
    capture.restore();
  }

  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /If this email is registered/);

  const logged = JSON.stringify(capture.calls);
  assert.doesNotMatch(logged, /student@example\.com/);
  assert.doesNotMatch(logged, new RegExp(state.sentOtp));
  assert.match(logged, /EENVELOPE/);
});

// ---------------------------------------------------------------------------
// POST /verify-reset-otp
// ---------------------------------------------------------------------------
test("a correct OTP returns a single-use reset token and burns the OTP", async () => {
  seedRecord();

  const res = await call(verifyResetOtp, {
    email: "Student@Example.com",
    otp: "123456",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.resetToken, /^[0-9a-f]{64}$/);
  assert.equal(res.body.expiresIn, 600);

  assert.equal(state.record.resetTokenHash, hashResetToken(res.body.resetToken));
  assert.notEqual(state.record.resetTokenHash, res.body.resetToken);
  assert.equal(state.record.attempts, 0);
  assert.ok(
    state.record.otpExpiresAt.getTime() <= Date.now(),
    "OTP must be invalidated after verification"
  );

  const tokenTtl = state.record.resetTokenExpiresAt.getTime() - Date.now();
  assert.ok(tokenTtl > 9 * 60 * 1000 && tokenTtl <= 10 * 60 * 1000 + 1000);

  assert.doesNotMatch(JSON.stringify(res.body), new RegExp(state.record.otpHash));
});

test("the same OTP cannot be verified twice", async () => {
  seedRecord();

  const first = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "123456",
  });
  assert.equal(first.statusCode, 200);

  const second = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "123456",
  });

  assert.equal(second.statusCode, 400);
  assert.equal(Object.hasOwn(second.body, "resetToken"), false);
});

test("a wrong OTP increments attempts atomically and issues nothing", async () => {
  seedRecord();

  const res = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "654321",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid or expired code. Request a new one.");
  assert.equal(Object.hasOwn(res.body, "resetToken"), false);
  assert.equal(state.record.attempts, 1);
  assert.equal(state.record.resetTokenHash, null);
});

test("the fifth wrong attempt is blocked and the record is destroyed", async () => {
  seedRecord({ attempts: 5 });

  const res = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "123456",
  });

  assert.equal(res.statusCode, 429);
  assert.match(res.body.message, /Too many attempts/);
  assert.equal(state.record, null);
});

test("an expired OTP is rejected and deleted", async () => {
  seedRecord({ otpExpiresAt: new Date(Date.now() - 1000) });

  const res = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "123456",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(Object.hasOwn(res.body, "resetToken"), false);
  assert.equal(state.record, null);
});

test("unknown email and wrong OTP share one indistinguishable response", async () => {
  seedRecord();

  const wrong = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "654321",
  });

  state.record = null;

  const unknown = await call(verifyResetOtp, {
    email: "nobody@example.com",
    otp: "654321",
  });

  assert.equal(unknown.statusCode, wrong.statusCode);
  assert.deepEqual(unknown.body, wrong.body);
});

test("a malformed OTP is rejected before any database lookup", async () => {
  seedRecord();

  const res = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "12ab56",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.findOneCalls, 0);
  assert.equal(state.record.attempts, 0);
});

test("verify-reset-otp rejects a consumed record", async () => {
  seedRecord({ consumedAt: new Date() });

  const res = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "123456",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(Object.hasOwn(res.body, "resetToken"), false);
});

test("verify-reset-otp fails safely when OTP_PEPPER is missing", async () => {
  seedRecord();
  delete process.env.OTP_PEPPER;

  const res = await call(verifyResetOtp, {
    email: "student@example.com",
    otp: "123456",
  });

  assert.equal(res.statusCode, 503);
  assert.ok(state.record, "record must not be destroyed on a server misconfiguration");
});

// ---------------------------------------------------------------------------
// POST /reset-password
// ---------------------------------------------------------------------------
test("a valid authorization updates only that user's password", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const res = await call(resetPassword, {
    email: "Student@Example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /Password updated/);
  assert.equal(Object.hasOwn(res.body, "token"), false);
  assert.equal(Object.hasOwn(res.body, "resetToken"), false);

  assert.equal(state.saveCalls, 1);
  // Raw assignment proves the controller relies on the existing bcrypt hook and
  // does not double-hash or use passwordAlreadyHashed.
  assert.equal(state.savedPassword, "newSecret1");
  assert.equal(state.lastUserQuery, "student@example.com");
  assert.equal(state.record, null, "reset authorization must be invalidated");
});

test("the same reset token cannot be used twice", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const body = {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  };

  const first = await call(resetPassword, body);
  assert.equal(first.statusCode, 200);

  const second = await call(resetPassword, body);
  assert.equal(second.statusCode, 400);
  assert.equal(state.saveCalls, 1, "the second attempt must not save again");
});

test("an expired authorization is rejected without touching the password", async () => {
  const token = generateResetToken();
  seedResetToken(token, { resetTokenExpiresAt: new Date(Date.now() - 1000) });

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.saveCalls, 0);
});

test("a wrong token is rejected and the valid authorization is preserved", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: generateResetToken(),
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.saveCalls, 0);
  assert.ok(state.record, "a wrong guess must not burn the real authorization");
  assert.equal(state.record.consumedAt, null);
});

test("an authorization for one email cannot reset another account", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const res = await call(resetPassword, {
    email: "attacker@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.saveCalls, 0);
  assert.equal(state.record.email, "student@example.com");
});

test("a consumed authorization cannot be claimed again", async () => {
  const token = generateResetToken();
  seedResetToken(token, { consumedAt: new Date() });

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.saveCalls, 0);
});

test("a failed atomic claim cannot reset the password", async () => {
  const token = generateResetToken();
  seedResetToken(token);
  state.failClaim = true;

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.saveCalls, 0);
  assert.equal(state.record.consumedAt, null);
});

test("a deleted account cannot be reset and the record is cleaned up", async () => {
  const token = generateResetToken();
  seedResetToken(token);
  state.userExists = false;
  state.user = null;

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.saveCalls, 0);
  assert.equal(state.record, null);
});

test("reset-password enforces confirmation matching", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret2",
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /do not match/i);
  assert.equal(state.saveCalls, 0);
});

test("reset-password keeps the existing 6 character minimum", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "abc12",
    confirmPassword: "abc12",
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /at least 6 characters/);
  assert.equal(state.saveCalls, 0);
});

test("reset-password rejects passwords above 72 UTF-8 bytes", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const longPassword = "😀".repeat(19); // 76 bytes
  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: longPassword,
    confirmPassword: longPassword,
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /72 bytes/);
  assert.equal(state.saveCalls, 0);
});

test("a malformed reset token is rejected before any database lookup", async () => {
  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: "not-a-token",
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(state.findOneCalls, 0);
  assert.equal(state.saveCalls, 0);
});

test("the reset response never exposes the password, hashes or a JWT", async () => {
  const token = generateResetToken();
  seedResetToken(token);

  const res = await call(resetPassword, {
    email: "student@example.com",
    resetToken: token,
    newPassword: "newSecret1",
    confirmPassword: "newSecret1",
  });

  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /newSecret1/);
  assert.doesNotMatch(serialized, new RegExp(token));
  assert.doesNotMatch(serialized, /otpHash|resetTokenHash/);
  assert.equal(Object.hasOwn(res.body, "user"), false);
});

test("no OTP or reset token is ever written to the console", async () => {
  const capture = captureConsole();
  let otp;
  let token;

  try {
    const forgot = await call(requestPasswordReset, {
      email: "student@example.com",
    });
    assert.equal(forgot.statusCode, 200);
    otp = state.sentOtp;

    const verified = await call(verifyResetOtp, {
      email: "student@example.com",
      otp,
    });
    assert.equal(verified.statusCode, 200);
    token = verified.body.resetToken;

    const reset = await call(resetPassword, {
      email: "student@example.com",
      resetToken: token,
      newPassword: "newSecret1",
      confirmPassword: "newSecret1",
    });
    assert.equal(reset.statusCode, 200);
  } finally {
    capture.restore();
  }

  const logged = JSON.stringify(capture.calls);
  assert.ok(otp, "expected an OTP to be generated");
  assert.ok(token, "expected a reset token to be issued");
  assert.ok(!logged.includes(otp), "OTP leaked to the console");
  assert.ok(!logged.includes(token), "reset token leaked to the console");
});
