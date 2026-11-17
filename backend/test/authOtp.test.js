const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { beforeEach, test } = require("node:test");

process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.JWT_EXPIRES_IN = "1h";

const state = {
  pending: null,
  userExists: false,
  sentEmail: null,
  sentOtp: null,
  sendError: null,
  upsert: null,
  stored: null,
  createConflict: false,
  deleteCalls: 0,
  pendingSaves: 0,
  savedUsers: [],
  lastCompany: null,
};

let sequence = 0;

class FakeUser {
  constructor(data) {
    Object.assign(this, data);
    this._id = `user-${++sequence}`;
    this.$locals = {};
    this.createdAt = new Date();
    this.skills = data.skills || [];
    this.location = data.location || "";
    this.phone = data.phone || "";
  }

  async save() {
    state.savedUsers.push(this);
    return this;
  }

  static async exists() {
    return state.userExists;
  }
}

const FakeCompany = {
  async create(data) {
    state.lastCompany = { _id: `company-${++sequence}`, ...data };
    return state.lastCompany;
  },
};

const FakePendingRegistration = {
  findOne() {
    const result = state.createConflict ? null : state.pending;

    return {
      select: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
  },
  async findOneAndUpdate(filter, update) {
    if (state.createConflict) return null;

    const cutoff = filter?.lastOtpSentAt?.$lte;

    // Simulate the real conditional update: no match inside the cooldown.
    if (
      state.pending?.lastOtpSentAt &&
      cutoff &&
      new Date(state.pending.lastOtpSentAt) > new Date(cutoff)
    ) {
      return null;
    }

    state.stored = {
      ...update.$set,
      _id: state.pending?._id || `pending-${++sequence}`,
      save: async () => {},
    };
    state.pending = state.stored;
    return state.stored;
  },
  async create(data) {
    if (state.createConflict || state.pending) {
      const error = new Error("E11000 duplicate key error collection");
      error.code = 11000;
      throw error;
    }

    state.stored = { ...data, _id: `pending-${++sequence}`, save: async () => {} };
    state.pending = state.stored;
    return state.stored;
  },
  async deleteOne() {
    state.deleteCalls += 1;
    state.pending = null;
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

// Replace external dependencies so this test never reads Firebase credentials,
// connects to MongoDB, or sends a real email.
stubModule("../config/firebaseAdmin", { verifyIdToken: async () => ({}) });
stubModule("../models/User", FakeUser);
stubModule("../models/Company", FakeCompany);
stubModule("../models/PendingRegistration", FakePendingRegistration);
stubModule("../utils/sendOtpEmail", {
  sendOtpEmail: async (email, otp) => {
    if (state.sendError) throw state.sendError;
    state.sentEmail = email;
    state.sentOtp = otp;
  },
});

const {
  register,
  verifyRegistrationOtp,
} = require("../controllers/authController");
const authRoutes = require("../routes/authRoutes");

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

const makePending = ({
  role = "student",
  otp = "123456",
  expiresAt,
  attempts = 0,
  companyName = "",
} = {}) => {
  const pending = {
    _id: "pending-1",
    name: "Test User",
    email: "student@example.com",
    password: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ",
    role,
    phone: "",
    companyName,
    otpHash: crypto.createHash("sha256").update(otp).digest("hex"),
    otpExpiresAt: expiresAt || new Date(Date.now() + 10 * 60 * 1000),
    attempts,
    async save() {
      state.pendingSaves += 1;
      return this;
    },
  };
  state.pending = pending;
  return pending;
};

beforeEach(() => {
  state.pending = null;
  state.userExists = false;
  state.sentEmail = null;
  state.sentOtp = null;
  state.sendError = null;
  state.upsert = null;
  state.stored = null;
  state.createConflict = false;
  state.deleteCalls = 0;
  state.pendingSaves = 0;
  state.savedUsers = [];
  state.lastCompany = null;
  sequence = 0;
});

test("POST /verify-otp is wired to the OTP verification controller", () => {
  const route = authRoutes.stack.find(
    (layer) => layer.route?.path === "/verify-otp" && layer.route?.methods?.post
  );

  assert.ok(route, "expected POST /verify-otp to be registered");
});

test("registration sends an OTP and never issues a JWT", async () => {
  const res = createResponse();

  await register(
    {
      body: {
        name: "Test User",
        email: "Student@Example.com",
        password: "secret1",
        role: "student",
      },
    },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.email, "student@example.com");
  assert.equal(Object.hasOwn(res.body, "token"), false);
  assert.equal(Object.hasOwn(res.body, "user"), false);
  assert.match(state.sentOtp, /^\d{6}$/);
  assert.equal(state.sentEmail, "student@example.com");
  assert.equal(state.stored.email, "student@example.com");
  assert.match(state.stored.password, /^\$2[aby]\$/);
  assert.equal(state.stored.role, "student");
});

test("a second OTP inside the cooldown is rejected without sending email", async () => {
  const pending = makePending();
  pending.lastOtpSentAt = new Date();

  const res = createResponse();

  await register(
    {
      body: {
        name: "Test User",
        email: "student@example.com",
        password: "secret1",
        role: "student",
      },
    },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.success, false);
  assert.equal(state.sentOtp, null);
  assert.equal(state.deleteCalls, 0);
});

test("a concurrent registration conflict cannot send a duplicate OTP", async () => {
  state.createConflict = true;

  const res = createResponse();

  await register(
    {
      body: {
        name: "Test User",
        email: "student@example.com",
        password: "secret1",
        role: "student",
      },
    },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.success, false);
  assert.equal(state.sentOtp, null);
});

test("email delivery failure returns 502, no token, and clears the pending record", async () => {
  state.sendError = Object.assign(
    new Error("Invalid login: 535 Authentication failed for mailer@relay.test"),
    { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" }
  );

  const res = createResponse();

  await register(
    {
      body: {
        name: "Test User",
        email: "Student@Example.com",
        password: "secret1",
        role: "student",
      },
    },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.success, false);
  assert.equal(Object.hasOwn(res.body, "token"), false);
  assert.equal(Object.hasOwn(res.body, "user"), false);
  assert.equal(state.sentOtp, null);
  assert.equal(state.deleteCalls, 1, "undelivered pending record must be removed");
  assert.match(res.body.message, /could not send the verification email/i);
  assert.doesNotMatch(res.body.message, /@|535|EAUTH|SMTP/i);
});

test("correct OTP returns the existing authentication contract", async () => {
  makePending();
  const res = createResponse();

  await verifyRegistrationOtp(
    { body: { email: "student@example.com", otp: "123456" } },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(typeof res.body.token, "string");
  assert.equal(res.body.token.split(".").length, 3);
  assert.equal(res.body.user.role, "student");
  assert.equal(res.body.company, undefined);
  assert.equal(state.savedUsers.length, 1);
  assert.equal(state.savedUsers[0].email, "student@example.com");
  assert.equal(state.deleteCalls, 1);

  const payload = JSON.parse(
    Buffer.from(res.body.token.split(".")[1], "base64url").toString("utf8")
  );
  assert.equal(payload.id, res.body.user._id);
});

test("wrong OTP is rejected without issuing a token", async () => {
  const pending = makePending({ otp: "654321" });
  const res = createResponse();

  await verifyRegistrationOtp(
    { body: { email: "student@example.com", otp: "123456" } },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(Object.hasOwn(res.body, "token"), false);
  assert.equal(pending.attempts, 1);
  assert.equal(state.pendingSaves, 1);
  assert.equal(state.savedUsers.length, 0);
});

test("expired OTP is rejected and the pending record is removed", async () => {
  makePending({ expiresAt: new Date(Date.now() - 1000) });
  const res = createResponse();

  await verifyRegistrationOtp(
    { body: { email: "student@example.com", otp: "123456" } },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(Object.hasOwn(res.body, "token"), false);
  assert.equal(state.deleteCalls, 1);
  assert.equal(state.savedUsers.length, 0);
});

test("malformed OTP is rejected before any lookup", async () => {
  makePending();
  const res = createResponse();

  await verifyRegistrationOtp(
    { body: { email: "student@example.com", otp: "12ab56" } },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 400);
  assert.equal(state.savedUsers.length, 0);
  assert.equal(state.deleteCalls, 0);
});

test("company role creates its company profile and returns it", async () => {
  makePending({ role: "company", companyName: "Acme Corp" });
  const res = createResponse();

  await verifyRegistrationOtp(
    { body: { email: "student@example.com", otp: "123456" } },
    res,
    forwardError
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, "company");
  assert.equal(res.body.company.companyName, "Acme Corp");
  assert.equal(res.body.company.verificationStatus, "pending");
  assert.equal(state.lastCompany.userId, res.body.user._id);
});
