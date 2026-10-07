const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const Resume = require("../models/Resume");
const AIAnalysis = require("../models/AIAnalysis");
const Job = require("../models/Job");
const { getSkillGap } = require("../controllers/aiController");
const { calculateSkillGap } = require("../services/skillGapService");

const originalResumeFindOne = Resume.findOne;
const originalAnalysisFindOne = AIAnalysis.findOne;
const originalJobFind = Job.find;

afterEach(() => {
  Resume.findOne = originalResumeFindOne;
  AIAnalysis.findOne = originalAnalysisFindOne;
  Job.find = originalJobFind;
});

const invokeController = async () => {
  const response = {
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
  };
  await getSkillGap({ user: { _id: "student-id" } }, response);
  return response;
};

test("skill gap analysis matches resume skills and prioritizes job requirements deterministically", () => {
  const result = calculateSkillGap(
    {
      skills: ["JavaScript", "JavaScript"],
      technicalSkills: ["Node.js"],
      softSkills: ["Communication", "communication", 42],
    },
    [
      { skillsRequired: ["JavaScript", "React", "Node.js"] },
      { skillsRequired: ["React", "Communication"] },
      { skillsRequired: ["React", "Python"] },
      { skillsRequired: ["React"] },
    ]
  );

  assert.deepEqual(result.yourSkills, ["JavaScript", "Node.js", "Communication"]);
  assert.deepEqual(result.otherSkills, ["JavaScript"]);
  assert.deepEqual(result.technicalSkills, ["Node.js"]);
  assert.deepEqual(result.softSkills, ["Communication"]);
  assert.deepEqual(result.matchedSkills, ["Communication", "JavaScript", "Node.js"]);
  assert.deepEqual(result.skillGaps, [
    { skill: "React", jobCount: 4 },
    { skill: "Python", jobCount: 1 },
  ]);
  assert.deepEqual(result.recommendedSkills, result.skillGaps);
  assert.deepEqual(result.learningPriority, {
    high: [{ skill: "React", jobCount: 4 }],
    medium: [{ skill: "Python", jobCount: 1 }],
    low: [],
  });
  assert.equal(result.jobsAnalyzed, 4);
  assert.equal(result.nextSteps.length, 3);
  assert.equal(JSON.stringify(result).includes("studentId"), false);
  assert.equal(JSON.stringify(result).includes("resumeId"), false);
});

test("skill gap analysis handles absent skill lists and jobs without requirements", () => {
  const result = calculateSkillGap({}, [
    { skillsRequired: [] },
    { title: "Job without valid structured skills", skillsRequired: "Python" },
  ]);

  assert.deepEqual(result.yourSkills, []);
  assert.deepEqual(result.matchedSkills, []);
  assert.deepEqual(result.skillGaps, []);
  assert.deepEqual(result.learningPriority, { high: [], medium: [], low: [] });
  assert.equal(result.jobsAnalyzed, 0);
  assert.deepEqual(result.nextSteps, []);
});

test("skill gap endpoint returns actionable setup errors without requesting external analysis", async () => {
  Resume.findOne = () => ({ select: async () => null });
  const missingResume = await invokeController();
  assert.equal(missingResume.statusCode, 404);
  assert.equal(
    missingResume.body.message,
    "Upload a resume to analyze your skill gap."
  );

  Resume.findOne = () => ({ select: async () => ({ _id: "resume-id" }) });
  AIAnalysis.findOne = () => ({ lean: async () => null });
  const missingAnalysis = await invokeController();
  assert.equal(missingAnalysis.statusCode, 404);
  assert.equal(
    missingAnalysis.body.message,
    "Analyze your resume to see your skill gap."
  );
});

test("skill gap endpoint uses only active job skill requirements and returns no private identifiers", async () => {
  let queriedJobs;
  let selectedFields;
  let sort;
  let limit;
  Resume.findOne = (filter) => {
    assert.deepEqual(filter, { studentId: "student-id" });
    return { select: async () => ({ _id: "resume-id" }) };
  };
  AIAnalysis.findOne = (filter) => {
    assert.deepEqual(filter, { studentId: "student-id", resumeId: "resume-id" });
    return {
      lean: async () => ({
        studentId: "private-student-id",
        resumeId: "private-resume-id",
        skills: ["JavaScript"],
        technicalSkills: ["Node.js"],
        softSkills: ["Communication"],
      }),
    };
  };
  Job.find = (filter) => {
    queriedJobs = filter;
    const query = {
      select(fields) {
        selectedFields = fields;
        return this;
      },
      sort(value) {
        sort = value;
        return this;
      },
      limit(value) {
        limit = value;
        return this;
      },
      lean: async () => [
        { skillsRequired: ["JavaScript", "React"] },
        { skillsRequired: ["Node.js", "React"] },
      ],
    };
    return query;
  };

  const response = await invokeController();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(queriedJobs, { status: "active" });
  assert.equal(selectedFields, "skillsRequired");
  assert.deepEqual(sort, { createdAt: -1 });
  assert.equal(limit, 1000);
  assert.deepEqual(response.body.data.skillGaps, [
    { skill: "React", jobCount: 2 },
  ]);
  assert.equal(JSON.stringify(response.body).includes("private-student-id"), false);
  assert.equal(JSON.stringify(response.body).includes("private-resume-id"), false);
});
