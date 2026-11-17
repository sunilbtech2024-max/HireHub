/**
 * HireHub email diagnostics.
 *
 * What it does:
 *   1. Validates the SMTP environment variables (names only, never values).
 *   2. Validates the SMTP host/port and opens a session with transporter.verify().
 *   3. Checks SPF / DKIM / DMARC of the sender domain.
 *   4. Prints an accurate verdict and remediation steps.
 *
 * It NEVER sends an email and never prints passwords, credentials, OTPs,
 * tokens, full email addresses, or mailbox local-parts.
 *
 * Usage:
 *   node test-smtp.js               run the diagnostic
 *   node test-smtp.js --self-test   offline checks of the detection logic
 */

require("dotenv").config({ quiet: true });

const dns = require("dns");
const nodemailer = require("nodemailer");
const assert = require("node:assert/strict");

const REQUIRED_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const GMAIL_HOSTS = new Set(["smtp.gmail.com", "smtp.googlemail.com"]);
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const BREVO_HOSTS = new Set([
  "smtp-relay.brevo.com",
  "smtp-relay.sendinblue.com",
  "smtp.sendinblue.com",
]);

// Brevo uses "mail", other providers commonly use the rest.
const DKIM_SELECTORS = ["mail", "brevo", "sendinblue", "smtp", "default", "selector1"];

const TIMEOUTS = {
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
};

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const normalize = (value) => String(value ?? "").trim();

const extractAddress = (value) => {
  const raw = normalize(value);
  const angled = raw.match(/<([^<>]+)>/);
  return (angled ? angled[1] : raw).trim();
};

const getDomain = (value) => {
  const address = extractAddress(value);
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return "";
  return address.slice(at + 1).toLowerCase();
};

const getLocalPart = (value) => {
  const address = extractAddress(value);
  const at = address.lastIndexOf("@");
  return at > 0 ? address.slice(0, at) : "";
};

const maskDomain = (domain) => {
  const value = normalize(domain);
  if (!value) return "Not available";

  const parts = value.split(".");
  if (parts.length < 2) {
    return `${value.slice(0, 1)}${"*".repeat(Math.max(3, value.length - 1))}`;
  }

  const name = parts.slice(0, -1).join(".");
  const tld = parts[parts.length - 1];
  return `${name.slice(0, 2)}${"*".repeat(Math.max(3, name.length - 2))}.${tld}`;
};

// Remove credentials, mailbox addresses and long tokens from any text.
const sanitizeMessage = (value, env) => {
  let output = normalize(value);

  for (const key of ["SMTP_PASS", "SMTP_USER", "SMTP_FROM"]) {
    const raw = normalize(env?.[key]);
    const address = extractAddress(raw);

    for (const secret of [raw, address]) {
      if (secret && secret.length >= 3) {
        output = output.split(secret).join("[redacted]");
      }
    }
  }

  output = output.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[mailbox]");
  output = output.replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]");

  return output.replace(/\s+/g, " ").trim().slice(0, 160);
};

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

function validateConfig(env) {
  const missingKeys = REQUIRED_KEYS.filter((key) => !normalize(env?.[key]));

  const host = normalize(env?.SMTP_HOST).toLowerCase();
  const hostValid =
    host.length > 0 && (host === "localhost" || HOST_PATTERN.test(host));

  const portText = normalize(env?.SMTP_PORT);
  const port = Number(portText);
  const portValid =
    /^\d{1,5}$/.test(portText) &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535;

  const fromValid = Boolean(getDomain(env?.SMTP_FROM));

  return {
    ok: missingKeys.length === 0 && hostValid && portValid && fromValid,
    missingKeys,
    host,
    hostValid,
    port,
    portValid,
    fromValid,
    secure: port === 465,
  };
}

function detectProvider(host) {
  const value = normalize(host).toLowerCase();
  if (GMAIL_HOSTS.has(value)) return "gmail";
  if (BREVO_HOSTS.has(value)) return "brevo";
  return "other";
}

// Gmail ignores dots and "+tags" when matching a mailbox.
const sameGmailMailbox = (from, user) => {
  const fromDomain = getDomain(from);
  const userDomain = getDomain(user);

  if (!GMAIL_DOMAINS.has(fromDomain) || !GMAIL_DOMAINS.has(userDomain)) {
    return false;
  }

  const normalizeLocal = (value) =>
    getLocalPart(value).toLowerCase().replace(/\+.*$/, "").replace(/\./g, "");

  const fromLocal = normalizeLocal(from);
  return fromLocal.length > 0 && fromLocal === normalizeLocal(user);
};

function classifyVerifyError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = normalize(error?.message).toLowerCase();

  if (code === "EAUTH" || code === "EMESSAGE") return "auth";
  if (/auth|credential|username and password|invalid login/.test(message)) {
    return "auth";
  }

  return "connection";
}

/* ------------------------------------------------------------------ */
/* DNS                                                                 */
/* ------------------------------------------------------------------ */

// Some Windows/network setups fail Node's default TXT resolver. Retry with
// public resolvers before giving up, so "Unknown" really means "could not ask".
const PUBLIC_DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];

function createTxtResolver() {
  let fallback = null;

  return async (name) => {
    try {
      return await dns.promises.resolveTxt(name);
    } catch (error) {
      const code = String(error?.code || "").toUpperCase();

      // A genuine "no such record" answer must not trigger a retry.
      if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENOTIMP") {
        throw error;
      }

      if (!fallback) {
        fallback = new dns.promises.Resolver({ timeout: 5000, tries: 2 });
        fallback.setServers(PUBLIC_DNS_SERVERS);
      }

      return fallback.resolveTxt(name);
    }
  };
}

async function readTxt(name, resolveTxt) {  try {
    const records = await resolveTxt(name);

    // A TXT record can be split into <=255-byte chunks; join chunks per record.
    return {
      status: "ok",
      records: records.map((chunks) => chunks.join("")),
    };
  } catch (error) {
    const code = String(error?.code || "").toUpperCase();

    // No record at all (normal case) versus a DNS failure (cannot tell).
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENOTIMP") {
      return { status: "missing", records: [] };
    }

    return { status: "unknown", records: [] };
  }
}

async function lookupDns(domain, provider, resolveTxt) {
  const result = {
    spf: { status: "missing", hasBrevo: false },
    dkim: { status: "not-checked", selector: "" },
    dmarc: { status: "missing", policy: "" },
  };

  if (!domain) return result;

  const spfLookup = await readTxt(domain, resolveTxt);
  const spfRecord = spfLookup.records.find((record) => /^v=spf1(\s|$)/i.test(record));

  if (spfRecord) {
    result.spf = {
      status: "present",
      hasBrevo: /include:spf\.brevo\.com|include:sendinblue/i.test(spfRecord),
    };
  } else {
    result.spf = { status: spfLookup.status === "unknown" ? "unknown" : "missing", hasBrevo: false };
  }

  const dmarcLookup = await readTxt(`_dmarc.${domain}`, resolveTxt);
  const dmarcRecord = dmarcLookup.records.find((record) => /^v=DMARC1(;|\s|$)/i.test(record));

  if (dmarcRecord) {
    result.dmarc = {
      status: "present",
      policy: (dmarcRecord.match(/p=(\w+)/i) || [])[1] || "none",
    };
  } else {
    result.dmarc = { status: dmarcLookup.status === "unknown" ? "unknown" : "missing", policy: "" };
  }

  // Google signs Gmail messages itself, so Brevo selectors are irrelevant there.
  if (provider === "gmail") {
    result.dkim = { status: "not-checked", selector: "" };
    return result;
  }

  let sawUnknown = false;

  for (const selector of DKIM_SELECTORS) {
    const dkimLookup = await readTxt(`${selector}._domainkey.${domain}`, resolveTxt);
    if (dkimLookup.status === "unknown") sawUnknown = true;

    const hasKey = dkimLookup.records.some((record) => /v=DKIM1|(^|;)\s*k=/i.test(record));
    if (hasKey) {
      result.dkim = { status: "present", selector };
      return result;
    }
  }

  result.dkim = { status: sawUnknown ? "unknown" : "missing", selector: "" };
  return result;
}

/* ------------------------------------------------------------------ */
/* Verdict                                                             */
/* ------------------------------------------------------------------ */

function buildVerdict(state) {
  if (!state.configOk) {
    const details = [];

    if (state.missingKeys.length) {
      details.push(`Missing variables: ${state.missingKeys.join(", ")}`);
    }
    if (!state.portValid) {
      details.push("Invalid SMTP_PORT: use a whole number between 1 and 65535.");
    }
    if (!state.hostValid) {
      details.push("Invalid SMTP_HOST: use a hostname such as smtp.gmail.com.");
    }
    if (!state.fromValid) {
      details.push("Invalid SMTP_FROM: it must contain a valid email address.");
    }

    return {
      level: "attention",
      lines: [
        "Configuration requires attention.",
        "Reason: SMTP configuration is incomplete or invalid.",
        ...details,
        "Next step: fix backend/.env and run this check again.",
      ],
    };
  }

  if (!state.connectionOk) {
    return {
      level: "attention",
      lines: [
        "Configuration requires attention.",
        "Reason: the SMTP server could not be reached.",
        "Next steps:",
        "  1. Confirm SMTP_HOST and SMTP_PORT.",
        "  2. Check network, firewall and whether the port is blocked.",
        "  3. Run this check again.",
      ],
    };
  }

  if (!state.authOk) {
    const steps =
      state.provider === "gmail"
        ? [
            "  1. Enable 2-Step Verification on the Google account.",
            "  2. Create a 16-character App Password and use it as SMTP_PASS.",
            "  3. Use the same Gmail address for SMTP_USER and SMTP_FROM.",
          ]
        : [
            "  1. Recheck the SMTP username and password/key.",
            "  2. Regenerate the SMTP key in the provider dashboard.",
            "  3. Restart the backend and run this check again.",
          ];

    return {
      level: "attention",
      lines: [
        "Configuration requires attention.",
        "Reason: SMTP authentication failed.",
        "Next steps:",
        ...steps,
      ],
    };
  }

  if (state.provider === "gmail") {
    if (state.mailboxMatch) {
      return {
        level: "ok",
        lines: [
          "Configuration appears correct.",
          "Gmail SMTP is recognized and SMTP_FROM matches the authenticated mailbox.",
          "Google applies its own SPF/DKIM signing for Gmail mail, so Brevo DKIM is not required.",
        ],
      };
    }

    return {
      level: "attention",
      lines: [
        "Configuration requires attention.",
        "Reason: SMTP_FROM does not match the authenticated Gmail mailbox.",
        "Gmail may rewrite the From header or refuse the message.",
        'Next step: use the same Gmail address for SMTP_USER and SMTP_FROM, or configure a verified "Send mail as" alias.',
      ],
    };
  }

  if (state.provider === "brevo") {
    const spfOk = state.spf.status === "present" && state.spf.hasBrevo;
    const dkimOk = state.dkim.status === "present";

    if (spfOk && dkimOk) {
      return {
        level: "ok",
        lines: [
          "Configuration appears correct.",
          "Brevo sender-domain DNS records (SPF include + DKIM) look present.",
        ],
      };
    }

    return {
      level: "attention",
      lines: [
        "Configuration requires attention.",
        "Reason: Brevo sender-domain authentication is incomplete.",
        ...(spfOk ? [] : ["  - SPF does not include spf.brevo.com."]),
        ...(dkimOk ? [] : ["  - No Brevo DKIM record found (mail._domainkey)."]),
        "Next steps:",
        "  1. Brevo > Senders, Domains & IPs: add and verify the sender domain.",
        "  2. Publish the SPF include (merge into the single existing SPF record).",
        "  3. Publish the DKIM record Brevo shows.",
        "  4. Keep DMARC at p=none while testing, then tighten it.",
        "  5. Set SMTP_FROM to an address on that domain and restart the backend.",
      ],
    };
  }

  const spfPresent = state.spf.status === "present";
  const dkimPresent = state.dkim.status === "present";

  if (spfPresent && dkimPresent) {
    return {
      level: "ok",
      lines: [
        "Configuration appears correct.",
        "Custom sender domain DNS records (SPF + DKIM) appear to be configured.",
      ],
    };
  }

  return {
    level: "attention",
    lines: [
      "Configuration requires attention.",
      "Reason: sender-domain authentication could not be confirmed for this provider.",
      ...(spfPresent ? [] : ["  - SPF record not found."]),
      ...(dkimPresent ? [] : ["  - DKIM record not found for the checked selectors."]),
      "Verify the SPF and DKIM records with your email provider.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Diagnostic run                                                      */
/* ------------------------------------------------------------------ */

async function runDiagnostics(env = process.env, deps = {}) {
  const resolveTxt = deps.resolveTxt || createTxtResolver();
  const createTransport = deps.createTransport || nodemailer.createTransport;

  console.log("\n=== HireHub Email Diagnostics ===\n");

  const config = validateConfig(env);
  const provider = config.ok ? detectProvider(config.host) : "unknown";
  const fromDomain = getDomain(env.SMTP_FROM);
  const mailboxMatch =
    provider === "gmail" ? sameGmailMailbox(env.SMTP_FROM, env.SMTP_USER) : false;

  console.log(`SMTP configuration: ${config.ok ? "OK" : "FAILED"}`);

  if (config.missingKeys.length) {
    console.log(`  Missing variables: ${config.missingKeys.join(", ")}`);
  }
  if (!config.missingKeys.includes("SMTP_PORT") && !config.portValid) {
    console.log("  Invalid SMTP_PORT: use a whole number between 1 and 65535.");
  }
  if (!config.missingKeys.includes("SMTP_HOST") && !config.hostValid) {
    console.log("  Invalid SMTP_HOST: use a hostname such as smtp.gmail.com.");
  }
  if (!config.missingKeys.includes("SMTP_FROM") && !config.fromValid) {
    console.log("  Invalid SMTP_FROM: it must contain a valid email address.");
  }

  console.log(
    `SMTP endpoint: ${
      config.ok
        ? `${config.host}:${config.port} (${config.secure ? "implicit TLS" : "STARTTLS"})`
        : "Not checked"
    }`
  );

  let connectionOk = false;
  let authOk = false;
  let connectionStatus = "Not checked";
  let authStatus = "Not checked";
  let failureDetail = "";

  if (config.ok) {
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: normalize(env.SMTP_USER),
        pass: normalize(env.SMTP_PASS),
      },
      ...TIMEOUTS,
      logger: false,
      debug: false,
    });

    try {
      // verify() only opens the session and authenticates; nothing is sent.
      await transporter.verify();
      connectionOk = true;
      authOk = true;
    } catch (error) {
      const kind = classifyVerifyError(error);

      if (kind === "auth") {
        connectionOk = true;
        authStatus = "FAILED";
      } else {
        connectionStatus = "FAILED";
      }

      failureDetail = `${String(error?.code || "UNKNOWN")}: ${sanitizeMessage(error?.message, env)}`;
    } finally {
      try {
        transporter.close();
      } catch {
        /* transport already closed */
      }
    }

    if (connectionOk) connectionStatus = "OK";
    if (authOk) authStatus = "OK";
  }

  console.log(`SMTP connection: ${connectionStatus}`);
  console.log(`SMTP authentication: ${authStatus}`);

  if (failureDetail) {
    console.log(`  Detail: ${failureDetail}`);
  }

  console.log(
    `Sender provider: ${
      provider === "gmail" ? "Gmail" : provider === "brevo" ? "Brevo" : provider === "other" ? "Other" : "Unknown"
    }`
  );
  console.log(`Sender domain: ${maskDomain(fromDomain)}`);

  if (provider === "gmail") {
    console.log(`Gmail mailbox match: ${mailboxMatch ? "OK" : "MISMATCH"}`);
  }

  const dnsState =
    config.ok && fromDomain
      ? await lookupDns(fromDomain, provider, resolveTxt)
      : {
          spf: { status: "not-checked", hasBrevo: false },
          dkim: { status: "not-checked", selector: "" },
          dmarc: { status: "not-checked", policy: "" },
        };

  const spfLabel = (() => {
    if (dnsState.spf.status === "not-checked") return "Not checked";
    if (dnsState.spf.status === "unknown") return "Unknown";
    if (dnsState.spf.status === "missing") return "Missing";

    if (provider === "gmail") return "Present (Google-managed)";
    return dnsState.spf.hasBrevo ? "Present (includes Brevo)" : "Present (without Brevo include)";
  })();

  const dkimLabel = (() => {
    if (dnsState.dkim.status === "not-checked") {
      return provider === "gmail"
        ? "Not checked (Google signs Gmail messages)"
        : "Not checked";
    }
    if (dnsState.dkim.status === "unknown") return "Unknown";
    if (dnsState.dkim.status === "missing") return "Missing";
    return `Present (selector: ${dnsState.dkim.selector})`;
  })();

  const dmarcLabel = (() => {
    if (dnsState.dmarc.status === "not-checked") return "Not checked";
    if (dnsState.dmarc.status === "unknown") return "Unknown";
    if (dnsState.dmarc.status === "missing") return "Missing";
    return `Present (p=${dnsState.dmarc.policy})`;
  })();

  console.log(`SPF status: ${spfLabel}`);
  console.log(`DKIM status: ${dkimLabel}`);
  console.log(`DMARC status: ${dmarcLabel}`);

  const verdict = buildVerdict({
    configOk: config.ok,
    missingKeys: config.missingKeys,
    portValid: config.portValid,
    hostValid: config.hostValid,
    fromValid: config.fromValid,
    connectionOk,
    authOk,
    provider,
    mailboxMatch,
    spf: dnsState.spf,
    dkim: dnsState.dkim,
    dmarc: dnsState.dmarc,
  });

  console.log("\nFINAL VERDICT:");
  for (const line of verdict.lines) console.log(line);

  console.log(
    "\nNote: no email was sent. SMTP authentication and DNS records are configuration\n" +
      "evidence only; they do not confirm inbox delivery."
  );

  if (provider === "gmail") {
    console.log("Confirm delivery in the recipient's Gmail inbox and Spam folder.");
  } else if (provider === "brevo") {
    console.log(
      "Confirm delivery in Brevo > Transactional > Logs (delivered / blocked / bounced / deferred)."
    );
  } else {
    console.log(
      "Confirm delivery in the provider's activity logs and the recipient's inbox/spam folder."
    );
  }

  return verdict.level === "ok" ? 0 : 1;
}

/* ------------------------------------------------------------------ */
/* Offline self-test (no network, no email, no .env values printed)    */
/* ------------------------------------------------------------------ */

async function runSelfTest() {
  const results = [];
  const gmailEnv = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USER: "someone@gmail.com",
    SMTP_PASS: "abcd efgh ijkl mnop",
    SMTP_FROM: "someone@gmail.com",
  };

  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, detail: sanitizeMessage(error.message, {}) });
    }
  };

  await check("Gmail host and port 587 detected", () => {
    const config = validateConfig(gmailEnv);
    assert.equal(config.ok, true);
    assert.equal(detectProvider(config.host), "gmail");
    assert.equal(config.secure, false);
  });

  await check("Gmail port 465 detected as implicit TLS", () => {
    const config = validateConfig({ ...gmailEnv, SMTP_PORT: "465" });
    assert.equal(config.secure, true);
    assert.equal(detectProvider(config.host), "gmail");
  });

  await check("smtp.googlemail.com detected as Gmail", () => {
    assert.equal(detectProvider("smtp.googlemail.com"), "gmail");
  });

  await check("googlemail.com alias matches gmail.com mailbox", () => {
    assert.equal(sameGmailMailbox("some.one@gmail.com", "someone@googlemail.com"), true);
  });

  await check("Different Gmail mailboxes do not match", () => {
    assert.equal(sameGmailMailbox("first@gmail.com", "second@gmail.com"), false);
  });

  await check("Brevo host detected", () => {
    assert.equal(detectProvider("smtp-relay.brevo.com"), "brevo");
  });

  await check("Legacy Sendinblue host detected as Brevo", () => {
    assert.equal(detectProvider("smtp-relay.sendinblue.com"), "brevo");
  });

  await check("Unknown host detected as Other", () => {
    assert.equal(detectProvider("smtp.example.org"), "other");
  });

  await check("Missing variables are reported", () => {
    const config = validateConfig({ ...gmailEnv, SMTP_PASS: "" });
    assert.equal(config.ok, false);
    assert.deepEqual(config.missingKeys, ["SMTP_PASS"]);
  });

  await check("Non-numeric port rejected", () => {
    const config = validateConfig({ ...gmailEnv, SMTP_PORT: "not-a-port" });
    assert.equal(config.ok, false);
    assert.equal(config.portValid, false);
  });

  await check("Out-of-range port rejected", () => {
    assert.equal(validateConfig({ ...gmailEnv, SMTP_PORT: "70000" }).portValid, false);
    assert.equal(validateConfig({ ...gmailEnv, SMTP_PORT: "0" }).portValid, false);
  });

  await check("Host with protocol rejected", () => {
    const config = validateConfig({ ...gmailEnv, SMTP_HOST: "http://smtp.gmail.com" });
    assert.equal(config.ok, false);
    assert.equal(config.hostValid, false);
  });

  await check("Invalid SMTP_FROM rejected", () => {
    const config = validateConfig({ ...gmailEnv, SMTP_FROM: "not-an-address" });
    assert.equal(config.ok, false);
    assert.equal(config.fromValid, false);
  });

  await check("No full address or local-part is printed", () => {
    const masked = maskDomain("gmail.com");
    assert.ok(masked.includes("*"));
    assert.ok(!masked.toLowerCase().includes("gmail"));

    const clean = sanitizeMessage(
      "login someone@gmail.com failed with abcd efgh ijkl mnop",
      gmailEnv
    );
    assert.ok(!clean.includes("someone@gmail.com"));
    assert.ok(!clean.includes("someone"));
    assert.ok(!clean.includes("abcd efgh"));
  });

  await check("Chunked TXT records are joined per record", async () => {
    const resolveTxt = async (name) => {
      if (name === "example.com") return [["v=spf1 ", "include:spf.brevo.com ~all"]];
      throw Object.assign(new Error("no data"), { code: "ENODATA" });
    };

    const state = await lookupDns("example.com", "brevo", resolveTxt);
    assert.equal(state.spf.status, "present");
    assert.equal(state.spf.hasBrevo, true);
  });

  await check("Missing DNS records report Missing", async () => {
    const resolveTxt = async () => {
      throw Object.assign(new Error("no data"), { code: "ENODATA" });
    };

    const state = await lookupDns("example.com", "brevo", resolveTxt);
    assert.equal(state.spf.status, "missing");
    assert.equal(state.dkim.status, "missing");
    assert.equal(state.dmarc.status, "missing");
  });

  await check("DNS failures degrade to Unknown", async () => {
    const resolveTxt = async () => {
      throw Object.assign(new Error("dns unavailable"), { code: "EAI_AGAIN" });
    };

    const state = await lookupDns("example.com", "brevo", resolveTxt);
    assert.equal(state.spf.status, "unknown");
    assert.equal(state.dkim.status, "unknown");
    assert.equal(state.dmarc.status, "unknown");
  });

  await check("Gmail skips Brevo DKIM selectors", async () => {
    const resolveTxt = async () => {
      throw Object.assign(new Error("no data"), { code: "ENODATA" });
    };

    const state = await lookupDns("gmail.com", "gmail", resolveTxt);
    assert.equal(state.dkim.status, "not-checked");
  });

  await check("Verdict: Gmail with matching mailbox is correct", () => {
    const verdict = buildVerdict({
      configOk: true,
      missingKeys: [],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: true,
      authOk: true,
      provider: "gmail",
      mailboxMatch: true,
      spf: { status: "present", hasBrevo: false },
      dkim: { status: "not-checked", selector: "" },
      dmarc: { status: "present", policy: "none" },
    });
    assert.equal(verdict.level, "ok");
  });

  await check("Verdict: Gmail mailbox mismatch requires attention", () => {
    const verdict = buildVerdict({
      configOk: true,
      missingKeys: [],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: true,
      authOk: true,
      provider: "gmail",
      mailboxMatch: false,
      spf: { status: "present", hasBrevo: false },
      dkim: { status: "not-checked", selector: "" },
      dmarc: { status: "present", policy: "none" },
    });
    assert.equal(verdict.level, "attention");
  });

  await check("Verdict: Brevo without SPF/DKIM requires attention", () => {
    const verdict = buildVerdict({
      configOk: true,
      missingKeys: [],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: true,
      authOk: true,
      provider: "brevo",
      mailboxMatch: false,
      spf: { status: "present", hasBrevo: false },
      dkim: { status: "missing", selector: "" },
      dmarc: { status: "present", policy: "none" },
    });
    assert.equal(verdict.level, "attention");
  });

  await check("Verdict: Brevo with SPF include and DKIM is correct", () => {
    const verdict = buildVerdict({
      configOk: true,
      missingKeys: [],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: true,
      authOk: true,
      provider: "brevo",
      mailboxMatch: false,
      spf: { status: "present", hasBrevo: true },
      dkim: { status: "present", selector: "mail" },
      dmarc: { status: "present", policy: "none" },
    });
    assert.equal(verdict.level, "ok");
  });

  await check("Verdict: missing configuration requires attention", () => {
    const verdict = buildVerdict({
      configOk: false,
      missingKeys: ["SMTP_HOST", "SMTP_PASS"],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: false,
      authOk: false,
      provider: "unknown",
      mailboxMatch: false,
      spf: { status: "not-checked", hasBrevo: false },
      dkim: { status: "not-checked", selector: "" },
      dmarc: { status: "not-checked", policy: "" },
    });
    assert.equal(verdict.level, "attention");
    assert.ok(verdict.lines.some((line) => line.includes("SMTP_HOST")));
  });

  await check("Verdict: authentication failure requires attention", () => {
    const verdict = buildVerdict({
      configOk: true,
      missingKeys: [],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: true,
      authOk: false,
      provider: "gmail",
      mailboxMatch: true,
      spf: { status: "present", hasBrevo: false },
      dkim: { status: "not-checked", selector: "" },
      dmarc: { status: "present", policy: "none" },
    });
    assert.equal(verdict.level, "attention");
  });

  await check("Verdict: connection failure requires attention", () => {
    const verdict = buildVerdict({
      configOk: true,
      missingKeys: [],
      portValid: true,
      hostValid: true,
      fromValid: true,
      connectionOk: false,
      authOk: false,
      provider: "gmail",
      mailboxMatch: true,
      spf: { status: "not-checked", hasBrevo: false },
      dkim: { status: "not-checked", selector: "" },
      dmarc: { status: "not-checked", policy: "" },
    });
    assert.ok(verdict.lines.some((line) => line.includes("could not be reached")));
  });

  await check("Auth errors are classified as authentication", () => {
    assert.equal(
      classifyVerifyError({ code: "EAUTH", message: "Invalid login: 535" }),
      "auth"
    );
  });

  await check("Network errors are classified as connection", () => {
    assert.equal(
      classifyVerifyError({ code: "ETIMEDOUT", message: "Connection timeout" }),
      "connection"
    );
  });

  console.log("\n=== HireHub Email Diagnostics self-test ===\n");

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.name}`);
    if (!result.ok) console.log(`      ${result.detail}`);
  }

  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);

  return failed === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ */

(async () => {
  try {
    const selfTest = process.argv.slice(2).includes("--self-test");
    const exitCode = selfTest ? await runSelfTest() : await runDiagnostics(process.env);
    process.exitCode = exitCode;
  } catch (error) {
    console.error("Diagnostics crashed:", sanitizeMessage(error.message, process.env));
    process.exitCode = 1;
  }
})();
