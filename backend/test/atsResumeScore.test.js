const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const mongoose = require("mongoose");
const Resume = require("../models/Resume");
const AIAnalysis = require("../models/AIAnalysis");
const { getResumeAnalysis } = require("../controllers/aiController");
const {
  calculateAtsResumeScore,
  WEIGHTS,
} = require("../services/atsResumeScoreService");

const originalResumeFindOne = Resume.findOne;
const originalAnalysisFindOne = AIAnalysis.findOne;

afterEach(() => {
  Resume.findOne = originalResumeFindOne;
  AIAnalysis.findOne = originalAnalysisFindOne;
});

const resumeText = [
  "Jordan Example jordan@example.com 555-555-5555",
  "Summary",
  "Software developer with experience delivering web applications.",
  "Technical Skills",
  "JavaScript, React, Node.js, MongoDB, Git",
  "Experience",
  "Software Developer 2021-2024",
  "• Developed a React application.",
  "• Improved performance by 30%.",
  "Projects",
  "Built a React and Node.js dashboard that improved reporting by 30%.",
  "Education",
  "Bachelor of Science, Example University, 2020",
  "Certifications",
  "Cloud Practitioner",
].join("\n");

const analysis = {
  skills: ["JavaScript", "React", "Node.js", "MongoDB", "Git"],
  technicalSkills: ["JavaScript", "React", "Node.js", "MongoDB", "Git"],
  missingSkills: ["Docker"],
  education: ["Bachelor of Science, Example University, 2020"],
  experience: ["Software Developer, 2021-2024"],
  projects: [
    "Built a React and Node.js dashboard that improved reporting by 30%.",
    "Developed a JavaScript application for project tracking.",
  ],
};

test("ATS resume score is deterministic, bounded, and follows configured weights", () => {
  const result = calculateAtsResumeScore(resumeText, analysis);

  assert.deepEqual(result, calculateAtsResumeScore(resumeText, analysis));
  assert.ok(Number.isInteger(result.overall));
  assert.ok(result.overall >= 0 && result.overall <= 100);
  assert.equal(Object.values(WEIGHTS).reduce((total, weight) => total + weight, 0), 100);

  for (const [category, weight] of Object.entries(WEIGHTS)) {
    const score = result.breakdown[category];
    assert.ok(Number.isInteger(score));
    assert.ok(score >= 0 && score <= 100);
    assert.equal(Number.isFinite(score * weight), true);
  }

  const weightedScore = Math.round(
    Object.entries(WEIGHTS).reduce(
      (total, [category, weight]) =>
        total + (result.breakdown[category] * weight) / 100,
      0
    )
  );
  assert.equal(result.overall, weightedScore);
});

test("missing experience lowers only its category while other resume sections still score", () => {
  const result = calculateAtsResumeScore(resumeText, {
    ...analysis,
    experience: [],
  });

  assert.equal(result.breakdown.experience, 0);
  assert.ok(result.overall > 0);
  assert.ok(result.breakdown.projects > 0);
  assert.ok(result.breakdown.technicalSkills > 0);
});

test("stronger project details and additional technical skills improve their scores", () => {
  const basicProject = "A basic project.";
  const singleStrongProject =
    "Built a React Node.js dashboard that improved reporting by 30%.";
  const baseline = calculateAtsResumeScore(resumeText, {
    ...analysis,
    projects: [basicProject],
    technicalSkills: ["JavaScript"],
  });
  const oneStrongProject = calculateAtsResumeScore(resumeText, {
    ...analysis,
    projects: [singleStrongProject],
    technicalSkills: ["JavaScript", "React", "Node.js"],
  });
  const stronger = calculateAtsResumeScore(resumeText, analysis);

  assert.ok(oneStrongProject.breakdown.projects > baseline.breakdown.projects);
  assert.ok(stronger.breakdown.projects > baseline.breakdown.projects);
  assert.ok(stronger.breakdown.technicalSkills > baseline.breakdown.technicalSkills);
});

test("empty or unavailable resume text safely omits ATS scoring", () => {
  assert.equal(calculateAtsResumeScore("   ", analysis), null);
  assert.equal(calculateAtsResumeScore(undefined, analysis), null);
});

test("analysis schema accepts bounded ATS breakdown values", async () => {
  const atsScore = calculateAtsResumeScore(resumeText, analysis);
  const document = new AIAnalysis({
    studentId: new mongoose.Types.ObjectId(),
    resumeId: new mongoose.Types.ObjectId(),
    summary: "Resume summary.",
    model: "test-model",
    atsScore,
  });

  await document.validate();
  document.atsScore.overall = 101;
  await assert.rejects(document.validate(), /atsScore\.overall/);
});

test("resume analysis endpoint adds ATS data without removing qualitative fields", async () => {
  Resume.findOne = (filter) => {
    assert.deepEqual(filter, { studentId: "student-id" });
    return {
      select: async (fields) => {
        assert.equal(fields, "_id +extractedText");
        return { _id: "resume-id", extractedText: resumeText };
      },
    };
  };
  AIAnalysis.findOne = (filter) => {
    assert.deepEqual(filter, { studentId: "student-id", resumeId: "resume-id" });
    return {
      lean: async () => ({
        ...analysis,
        summary: "A software developer with project experience.",
        studentId: "student-id",
        resumeId: "resume-id",
      }),
    };
  };

  const response = {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await getResumeAnalysis({ user: { _id: "student-id" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.summary, "A software developer with project experience.");
  assert.equal(response.body.data.atsScore.overall >= 0, true);
  assert.equal(response.body.data.atsScore.overall <= 100, true);
  assert.equal("studentId" in response.body.data, false);
  assert.equal("resumeId" in response.body.data, false);
});

test("resume analysis remains available when ATS scoring has no extracted text", async () => {
  Resume.findOne = () => ({
    select: async () => ({ _id: "resume-id", extractedText: "" }),
  });
  AIAnalysis.findOne = () => ({
    lean: async () => ({ summary: "Existing qualitative analysis." }),
  });

  const response = {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await getResumeAnalysis({ user: { _id: "student-id" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.summary, "Existing qualitative analysis.");
  assert.equal("atsScore" in response.body.data, false);
});
