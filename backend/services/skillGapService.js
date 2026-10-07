const { matchJob } = require("./jobMatchingService");

const cleanSkills = (skills) => {
  if (!Array.isArray(skills)) return [];
  const seen = new Set();
  return skills
    .filter((skill) => typeof skill === "string")
    .map((skill) => skill.trim().slice(0, 100))
    .filter((skill) => {
      const normalized = skill.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 100);
};

const calculateSkillGap = (analysis, jobs) => {
  const technicalSkills = cleanSkills(analysis.technicalSkills);
  const softSkills = cleanSkills(analysis.softSkills);
  const categorizedSkills = new Set(
    [...technicalSkills, ...softSkills].map((skill) => skill.toLowerCase())
  );
  const otherSkills = cleanSkills(analysis.skills).filter(
    (skill) => !categorizedSkills.has(skill.toLowerCase())
  );
  const candidateSkills = cleanSkills([
    ...otherSkills,
    ...technicalSkills,
    ...softSkills,
  ]);
  const skillCounts = new Map();
  const matchedSkills = new Map();
  let jobsWithRequirements = 0;

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const skillsRequired = cleanSkills(job?.skillsRequired);
    if (!skillsRequired.length) continue;
    jobsWithRequirements += 1;

    const { matchedSkills: matched, missingSkills: missing } = matchJob(
      { skillsRequired },
      { skills: candidateSkills, technicalSkills: [] }
    );

    for (const skill of matched) {
      matchedSkills.set(skill.toLowerCase(), skill);
    }
    for (const skill of missing) {
      const key = skill.toLowerCase();
      const existing = skillCounts.get(key);
      skillCounts.set(key, {
        skill: existing?.skill || skill,
        jobCount: (existing?.jobCount || 0) + 1,
      });
    }
  }

  const skillGaps = [...skillCounts.values()].sort(
    (left, right) =>
      right.jobCount - left.jobCount ||
      left.skill.localeCompare(right.skill)
  );
  const learningPriority = { high: [], medium: [], low: [] };

  for (const gap of skillGaps) {
    const share = gap.jobCount / jobsWithRequirements;
    const priority = share >= 0.5 ? "high" : share >= 0.2 ? "medium" : "low";
    learningPriority[priority].push(gap);
  }

  const nextSteps = [];
  if (learningPriority.high.length) {
    nextSteps.push(
      `Start with ${learningPriority.high.map(({ skill }) => skill).join(", ")}; each is required by at least half of the active jobs with skill requirements.`
    );
  }
  if (learningPriority.medium.length) {
    nextSteps.push(
      `Consider ${learningPriority.medium.map(({ skill }) => skill).join(", ")} next; each appears in at least one fifth of those active job listings.`
    );
  }
  if (skillGaps.length) {
    nextSteps.push(
      "Choose a skill to practice in a project related to your target role, then review your gaps again as job listings change."
    );
  }

  return {
    yourSkills: candidateSkills,
    otherSkills,
    technicalSkills,
    softSkills,
    matchedSkills: [...matchedSkills.values()].sort((left, right) =>
      left.localeCompare(right)
    ),
    skillGaps,
    recommendedSkills: skillGaps,
    learningPriority,
    jobsAnalyzed: jobsWithRequirements,
    nextSteps,
  };
};

module.exports = { calculateSkillGap };
