const WEIGHTS = {
  keywords: 25,
  technicalSkills: 20,
  structure: 15,
  projects: 15,
  education: 10,
  experience: 10,
  formatting: 5,
};

const toTextList = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];

const uniqueNormalized = (values) =>
  [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];

const hasSectionHeading = (text, pattern) =>
  new RegExp(`(?:^|\\n)\\s*(?:${pattern})\\s*(?::|\\n|$)`, "i").test(text);

const percentage = (score) => Math.max(0, Math.min(100, Math.round(score)));

const calculateAtsResumeScore = (resumeText, analysis = {}) => {
  if (typeof resumeText !== "string" || !resumeText.trim()) return null;

  const text = resumeText.replace(/\r\n?/g, "\n");
  const technicalSkills = uniqueNormalized(toTextList(analysis.technicalSkills));
  const presentSkills = uniqueNormalized([
    ...toTextList(analysis.skills),
    ...technicalSkills,
  ]);
  const missingSkills = uniqueNormalized(toTextList(analysis.missingSkills)).filter(
    (skill) => !presentSkills.includes(skill)
  );

  const sectionPatterns = [
    /(?:professional\s+)?summary|objective|profile/,
    /technical\s+skills|skills|core\s+competencies/,
    /work\s+experience|professional\s+experience|employment(?:\s+history)?|experience/,
    /projects|project\s+experience/,
    /education|academic(?:\s+background)?/,
    /certifications?|licenses?/,
  ];
  const sectionCount = sectionPatterns.filter((pattern) =>
    hasSectionHeading(text, pattern.source)
  ).length;

  const projects = toTextList(analysis.projects);
  const projectScores = projects.map((project) => {
    const words = project.split(/\s+/).filter(Boolean);
    const projectText = project.toLowerCase();
    const containsTechnicalSkill = technicalSkills.some((skill) =>
      projectText.includes(skill)
    );
    const hasOutcome = /\b(?:increased|reduced|improved|delivered|achieved|saved|grew|decreased)\b|\b\d+(?:\.\d+)?%?\b/i.test(project);
    return (
      40 +
      (words.length >= 12 ? 20 : 0) +
      (hasOutcome ? 20 : 0) +
      (containsTechnicalSkill ? 20 : 0)
    );
  });
  const projectQuality = projectScores.length
    ? Math.min(projectScores.length / 2, 1) * 30 +
      (projectScores.reduce((total, score) => total + score, 0) /
        projectScores.length) *
        0.7
    : 0;

  const education = toTextList(analysis.education);
  const experience = toTextList(analysis.experience);
  const hasEducationHeading = hasSectionHeading(text, "education|academic(?:\\s+background)?");
  const hasExperienceHeading = hasSectionHeading(
    text,
    "work\\s+experience|professional\\s+experience|employment(?:\\s+history)?|experience|internships?"
  );

  const formattingSignals = [
    text.trim().length >= 300 && text.trim().length <= 40000,
    sectionCount >= 3,
    text.split("\n").filter((line) => /^\s*[•●▪*-]\s+\S/.test(line)).length >= 2,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
      /\b(?:linkedin\.com|github\.com)\b/i.test(text) ||
      /(?:\+?\d[\d\s().-]{7,}\d)/.test(text),
    text.split("\n").filter((line) => line.trim().length > 0).length >= 8,
  ].filter(Boolean).length;

  const breakdown = {
    keywords: percentage(
      (presentSkills.length /
        Math.max(8, presentSkills.length + missingSkills.length)) *
        100
    ),
    technicalSkills: percentage((technicalSkills.length / 5) * 100),
    structure: percentage((sectionCount / sectionPatterns.length) * 100),
    projects: percentage(projectQuality),
    education: percentage(
      (education.length ? 35 : 0) +
        (hasEducationHeading ? 25 : 0) +
        (/\b(?:bachelor|master|b\.?s\.?|m\.?s\.?|ph\.?d|degree|diploma)\b/i.test(text)
          ? 20
          : 0) +
        (/\b(?:university|college|institute|graduat(?:ed|ion)|20\d{2})\b/i.test(text)
          ? 20
          : 0)
    ),
    experience: percentage(
      experience.length
        ? 35 +
            (hasExperienceHeading ? 25 : 0) +
            (/\b(?:20\d{2}|19\d{2})\b/.test(text) ? 20 : 0) +
            (/\b(?:intern|managed|developed|led|built|designed|implemented|achieved)\b/i.test(
              text
            )
              ? 20
              : 0)
        : 0
    ),
    formatting: percentage((formattingSignals / 5) * 100),
  };

  const overall = Math.round(
    Object.entries(WEIGHTS).reduce(
      (total, [category, weight]) => total + (breakdown[category] * weight) / 100,
      0
    )
  );

  return { overall, breakdown };
};

module.exports = { calculateAtsResumeScore, WEIGHTS };
