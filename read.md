# HireHub — OTP Email Delivery: Continuation Notes

> **Purpose:** Is file mein wahi state save hai jahan tak kaam pahucha. Agli session mein
> yahin se continue karna hai. Ye documentation-only file hai — iska code par koi asar nahi.
>
> **Last updated:** 16 Nov 2026
> **Status:** Option B (Gmail SMTP) pending on user side — `.env` abhi bhi Brevo par hai.

---

## 1. Objective

HireHub (MERN) registration OTP email reliably deliver karana, **bina authentication
system ko chhede**.

- Brevo SMTP par: connection OK, authentication OK, lekin actual inbox delivery confirm nahi.
- Chuna gaya rasta: **Option B — Gmail SMTP + Google App Password** (turant chalne wala fix).
- Brevo domain authentication (Option A) filhal possible nahi, kyunki project ke paas apna
  domain nahi hai — sirf `hire-hub-five-xi.vercel.app` hai, aur `vercel.app` ka DNS
  Vercel ke control mein hai (edit nahi kar sakte).

---

## 2. Root cause (confirmed)

**Code theek hai. Problem sender identity / sender-domain authentication ki hai.**

| Item | Value / State |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` (STARTTLS) |
| `SMTP_USER` | Brevo-generated login (`@smtp-brevo.com`) |
| `SMTP_FROM` | ek free Gmail mailbox (domain `gm***.com`) |
| SPF (sender domain) | Present, lekin **Brevo include ke bina** |
| DKIM (Brevo selector `mail._domainkey`) | **Missing** |
| DMARC | Present, `p=none` |

Kya hota hai:

1. Brevo relay authenticate kar leta hai → `SMTP authentication: OK`.
2. Relay message accept kar leta hai → `250 Accepted`
   (log: `OTP email accepted by SMTP relay`) — **ye delivery nahi hai**.
3. Lekin `From:` domain (gmail.com) Brevo se authenticated nahi hai → receiving server
   (Gmail/Outlook) us message ko spam mein daal deta hai ya block/defer/bounce kar deta hai.

**One-liner:** SMTP authentication ≠ sender authentication.

---

## 3. SMTP env variables kahan read hote hain

Runtime par **sirf ek jagah**:

**`backend/utils/sendOtpEmail.js` → `readSmtpConfig()`**

| Line | Variable |
|---|---|
| 49 | `process.env.SMTP_PORT` (integer check; `465` → implicit TLS, warna `requireTLS`) |
| 60 | `process.env.SMTP_HOST` |
| 63 | `process.env.SMTP_USER` |
| 64 | `process.env.SMTP_PASS` |
| 65 | `process.env.SMTP_FROM` |

Call chain:

```
frontend/src/pages/Register.jsx
  → POST /api/auth/register
    → authController.register
      → utils/sendOtpEmail.js (sendOtpEmail)
        → readSmtpConfig() → nodemailer transporter → sendMail()
```

Baaki jagah `SMTP_*` sirf test files mein hai (`backend/test/sendOtpEmail.test.js`).
`backend/test-smtp.js` bhi `process.env` padhta hai, par **sirf diagnostics** ke liye —
usme `sendMail` call **nahi** hai (sirf `transporter.verify()`).

**Iska matlab:** `.env` ke 5 values badalne se poora email path switch ho jayega,
kisi code change ki zarurat nahi.

---

## 4. Diagnostic script (backend/test-smtp.js)

Rewrite ho chuka hai (earlier phase). Capabilities:

- Provider detection: **Gmail / Brevo / Other** (`smtp.gmail.com`, `smtp.googlemail.com`,
  `smtp-relay.brevo.com`, `smtp-relay.sendinblue.com`, `smtp.sendinblue.com`).
- Port mapping: `587` = STARTTLS, `465` = implicit TLS.
- Gmail mailbox match: gmail.com ↔ googlemail.com alias, dot aur `+tag` ignore.
- SPF / DKIM / DMARC: chunked TXT records per-record join, `ENODATA` = Missing,
  transport failure = Unknown, public-DNS fallback (`8.8.8.8`, `1.1.1.1`).
- Gmail par Brevo DKIM selectors **check hi nahi** hote
  (`DKIM status: Not checked (Google signs Gmail messages)`).
- Output masking: `gm***.com` — full email / local-part kabhi print nahi.
- Error sanitization: credentials, mailbox addresses, long base64 blobs redact.
- Timeouts: connection 15s, greeting 15s, socket 20s; `logger: false, debug: false`.
- `transporter.close()` in `finally`.
- 6 alag verdicts (config / connection / auth / Gmail ok / Brevo incomplete / custom domain ok).
- Offline mode: `node test-smtp.js --self-test` (network zero, mail zero).

### Latest actual results

```
node --check test-smtp.js        → exit 0
node test-smtp.js --self-test    → 27/27 checks passed, exit 0
node test-smtp.js                → Brevo branch, "Configuration requires attention", exit 1
```

Live output (current `.env`, Brevo):

```
SMTP configuration: OK
SMTP endpoint: smtp-relay.brevo.com:587 (STARTTLS)
SMTP connection: OK
SMTP authentication: OK
Sender provider: Brevo
Sender domain: gm***.com
SPF status: Present (without Brevo include)
DKIM status: Missing
DMARC status: Present (p=none)
FINAL VERDICT: Configuration requires attention.
```

Gmail branch runtime proof (shell-only env override, **fake creds**, koi mail nahi):

```
SMTP endpoint: smtp.gmail.com:587 (STARTTLS)
SMTP connection: OK
SMTP authentication: FAILED        (fake password → expected)
Sender provider: Gmail
Gmail mailbox match: OK
SPF status: Present (Google-managed)
DKIM status: Not checked (Google signs Gmail messages)
DMARC status: Present (p=none)
Reason: SMTP authentication failed → App Password steps shown
```

➡️ Gmail branch sahi kaam kar raha hai. `test-smtp.js` mein **koi change pending nahi**.

---

## 5. Remaining work (user side)

### Step 1 — `backend/.env` manually update karo

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_GMAIL_ADDRESS
SMTP_PASS=YOUR_GOOGLE_APP_PASSWORD
SMTP_FROM=YOUR_GMAIL_ADDRESS
```

Checklist:

- [ ] Google Account → Security → **2-Step Verification ON**
- [ ] App Passwords → naya 16-char app password (spaces ke bina)
- [ ] `SMTP_USER` aur `SMTP_FROM` **same mailbox**
- [ ] Duplicate `SMTP_*` lines na ho (ek hi `SMTP_HOST` etc.)
- [ ] App password **chat mein kabhi na bhejo**
- [ ] `.env` save → **backend restart**

Agar 587 network/firewall se block ho: `SMTP_PORT=465` (implicit TLS — script detect kar leti hai).

### Step 2 — Verify config

```powershell
cd "C:\Users\SUNIL KUMAR\OneDrive\Desktop\HireHub\backend"
node test-smtp.js
```

Expected:

```
SMTP endpoint: smtp.gmail.com:587 (STARTTLS)
SMTP connection: OK
SMTP authentication: OK
Sender provider: Gmail
Gmail mailbox match: OK
SPF status: Present (Google-managed)
DKIM status: Not checked (Google signs Gmail messages)
FINAL VERDICT: Configuration appears correct.
```

Failure meanings:

| Output | Matlab |
|---|---|
| `SMTP authentication: FAILED` | App Password galat/expired, ya 2FA off |
| `Gmail mailbox match: MISMATCH` | `SMTP_USER` aur `SMTP_FROM` alag mailbox |
| `SMTP connection: FAILED` | Port/firewall ya host galat |

### Step 3 — Actual OTP delivery test

```powershell
cd "C:\Users\SUNIL KUMAR\OneDrive\Desktop\HireHub\backend"
node server.js
```

Naya terminal:

```powershell
$body = @{ name="Test User"; email="aapka.real@gmail.com"; password="YOUR_STRONG_PASSWORD"; role="candidate" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -ContentType "application/json" -Body $body
```

OTP verify:

```powershell
$body = @{ email="aapka.real@gmail.com"; otp="123456" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/verify-otp" -Method Post -ContentType "application/json" -Body $body
```

> Request fields `Register.jsx` ke hisaab se adjust kar lena.

### Step 4 — Delivery confirm (success ki definition)

- Gmail SMTP → recipient ka **Inbox + Spam** (sender ke **Sent** folder mein bhi check).
- Brevo SMTP (future) → **Brevo → Transactional → Logs** (delivered / blocked / bounced / deferred).

**Jab tak ye confirm na ho, "email delivery fixed" mat kehna.** `verify()` sirf
configuration evidence hai.

---

## 6. Code state (jo pehle hi ho chuka hai)

Auth/OTP side par jo modifications pehle ke approved phases mein hui (is documentation
turn mein kuch nahi badla):

- `backend/controllers/authController.js`
  - `register`: awaited `sendOtpEmail`, send fail par **502** + `PendingRegistration.deleteOne`,
    atomic OTP claim + **60s cooldown**, token/session sirf verify ke baad.
  - Safe logs: `code`, `responseCode`, `command`, redacted `message`; success par sirf `messageId`.
- `backend/utils/sendOtpEmail.js`
  - env validation (sirf variable **names**), `requireTLS`, timeouts, per-send transporter +
    `close()`, `redact()` se credentials/addresses mask.
- `backend/models/PendingRegistration.js`
  - OTP **hash** (plaintext nahi), expiry **10 min**, attempts cap **5**, TTL index.
- `backend/routes/authRoutes.js`
  - `/register`, `/verify-otp`, `/login`, `/google`, `/me`.
- `backend/test/authOtp.test.js`, `backend/test/sendOtpEmail.test.js`
  - OTP flow (success/failure/cooldown/conflict), config + redaction + TLS tests.
- `backend/test-smtp.js`
  - Upary wala diagnostic + `--self-test`.

### Test results (latest verified run)

```
node --check controllers/authController.js            → exit 0
node -e "require('./controllers/authController')"     → controller_loaded_ok
Safe backend suite                                    → 52 tests, 51 pass, 0 fail, 1 skip
```

Safe suite command:

```powershell
cd "C:\Users\SUNIL KUMAR\OneDrive\Desktop\HireHub\backend"
node --test test/authOtp.test.js test/sendOtpEmail.test.js test/atsResumeScore.test.js test/externalJob.test.js test/mockInterview.test.js test/scraper.test.js test/skillGap.test.js
```

`test/resumeStorage.test.js` deliberately exclude hai (live Atlas/Cloudinary chahiye).
`scraper` ka Mongo test bina `SCRAPER_TEST_MONGO_URI` auto-skip ho jata hai.

---

## 7. Rules jo follow karni hain (aage bhi)

1. **`.env` kabhi auto-modify nahi** — user khud edit karega.
2. Password / OTP / token / full email / local-part **kabhi terminal ya chat mein print nahi**.
3. `authController.js`, routes, models, frontend, Google Sign-In, JWT, registration/OTP
   verification, roles, password security — **bina zarurat touch nahi**.
4. Koi bhi extra file modify karne se pehle **permission**.
5. Diagnostics mein **koi real email nahi** bhejna (`sendMail` sirf actual register flow mein).
6. DNS records **invent nahi** — Brevo dashboard jo exact de, wahi use ho.
7. Success claim tabhi, jab real inbox/Spam ya provider logs confirm kare.

---

## 8. Next session start point

1. User `.env` update karke backend restart karega.
2. `node test-smtp.js` → expect `smtp.gmail.com` + auth OK + **"Configuration appears correct"**.
3. `node test-smtp.js --self-test` → expect `27/27`.
4. `/api/auth/register` → OTP mail inbox/Spam mein check.
5. `/api/auth/verify-otp` → 201 + token.
6. Delivery confirm hone ke baad hi: "fixed" declare karna.

**Pending/optional (abhi zarurat nahi):**
- Google Sign-In popup-closed bug fix (deferred, auth flow se related, alag approval chahiye).
- Bleed-over cleanup: `backend/firebase-service-account.json` repo mein untracked hai —
  deploy se pehle `.gitignore` check karna chahiye (koi change kiye bina).
- Brevo Option A: sirf tab, jab apna domain ho.
