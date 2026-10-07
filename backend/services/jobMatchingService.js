const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsSkill = (text, skill) => {
  const expression = new RegExp(
    `(^|[^a-z0-9+#.])${escapeRegex(skill.trim().toLowerCase())}($|[^a-z0-9+#.])`,
    "i"
  );
  return expression.test(text.toLowerCase());
};

const overlaps = (requirement, candidateText) => {
  const meaningfulWords = requirement
    .toLowerCase()
    .match(/[a-z0-9+#.]{3,}/g) || [];
  const ignored = new Set(["and", "with", "years", "year", "required", "degree"]);
  const terms = meaningfulWords.filter((word) => !ignored.has(word));
  return terms.some((term) => containsSkill(candidateText, term));
};

const matchJob = (job, analysis) => {
  const candidateSkills = [
    ...(analysis.skills || []),
    ...(analysis.technicalSkills || []),
  ].filter((skill, index, all) =>
    skill && all.findIndex((item) => item.toLowerCase() === skill.toLowerCase()) === index
  );
  const requiredSkills = [...new Set((job.skillsRequired || []).filter(Boolean))];
  const matchedSkills = requiredSkills.filter((required) =>
    candidateSkills.some(
      (candidate) =>
        candidate.toLowerCase() === required.toLowerCase() ||
        containsSkill(candidate, required) ||
        containsSkill(required, candidate)
    )
  );
  const missingSkills = requiredSkills.filter(
    (required) => !matchedSkills.includes(required)
  );
  const breakdown = [];
  let totalWeight = 0;
  let weightedScore = 0;

  if (requiredSkills.length) {
    const skillsScore = (matchedSkills.length / requiredSkills.length) * 100;
    breakdown.push({
      factor: "skills",
      score: Math.round(skillsScore),
      weight: 80,
    });
    weightedScore += skillsScore * 80;
    totalWeight += 80;
  }

  const experienceText = (analysis.experience || []).join(" ");
  if (job.experience && experienceText) {
    const experienceScore = overlaps(job.experience, experienceText) ? 100 : 0;
    breakdown.push({ factor: "experience", score: experienceScore, weight: 10 });
    weightedScore += experienceScore * 10;
    totalWeight += 10;
  }

  const educationText = (analysis.education || []).join(" ");
  if (job.educationRequired && educationText) {
    const educationScore = overlaps(job.educationRequired, educationText) ? 100 : 0;
    breakdown.push({ factor: "education", score: educationScore, weight: 10 });
    weightedScore += educationScore * 10;
    totalWeight += 10;
  }

  const matchScore = totalWeight
    ? Math.round(weightedScore / totalWeight)
    : 0;
  return {
    matchScore,
    matchedSkills,
    missingSkills,
    matchBreakdown: breakdown.map((factor) => ({
      ...factor,
      weight: totalWeight ? Math.round((factor.weight / totalWeight) * 100) : 0,
    })),
  };
};

module.exports = { matchJob };
