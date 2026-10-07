const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  const normalizedSecret =
    typeof secret === "string" ? secret.trim().toLowerCase() : "";
  const entropy = (() => {
    if (!secret) return 0;
    const frequencies = new Map();
    for (const character of secret) {
      frequencies.set(character, (frequencies.get(character) || 0) + 1);
    }
    return [...frequencies.values()].reduce((total, count) => {
      const probability = count / secret.length;
      return total - probability * Math.log2(probability);
    }, 0);
  })();
  const hasPlaceholderLanguage =
    /\b(?:replace|example|sample|placeholder|template|insert|enter|default|todo|fixme)\b/i.test(
      normalizedSecret.replace(/[^a-z0-9]+/g, " ")
    ) ||
    /\bchange[\s_-]*me\b|\b(?:your|my)[\s_-]+(?:jwt[\s_-]+)?(?:secret|password|key|token)\b|\b(?:secret|password|key|token)[\s_-]+(?:goes[\s_-]+)?(?:here|value|placeholder)\b|\b(?:set|use|put|generate)[\s_-]+(?:your[\s_-]+)?(?:jwt[\s_-]+)?(?:secret|password|key|token)\b/i.test(
      normalizedSecret
    );
  const hasTemplateMarkers =
    /<[^>]+>|\[[^\]]+\]|\{\{[^}]+\}\}|(?:x{4,}|0{8,}|1234|abcd|qwerty)/i.test(
      normalizedSecret
    );
  const isWeak =
    typeof secret !== "string" ||
    secret.trim().length < 32 ||
    /^(.)\1+$/.test(normalizedSecret) ||
    hasPlaceholderLanguage ||
    hasTemplateMarkers ||
    entropy < 3.5;

  if (isWeak) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters and use a strong, non-placeholder value"
    );
  }

  return secret.trim();
};

module.exports = getJwtSecret;
