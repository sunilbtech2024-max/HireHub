
const disposableDomains = require("disposable-email-domains");

const disposableDomainSet = new Set(
  disposableDomains.map((domain) => domain.toLowerCase())
);

function isDisposableEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const parts = normalizedEmail.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  return disposableDomainSet.has(parts[1]);
}

module.exports = { isDisposableEmail };
