const express = require("express");
const {
  analyzeResume,
  getResumeAnalysis,
  getRecommendedJobs,
  getSkillGap,
} = require("../controllers/aiController");
const {
  evaluateMockInterviewAnswer,
  getNextMockInterviewQuestion,
  startMockInterview,
} = require("../controllers/mockInterviewController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, authorize("student"));
router.post("/resume/analyze", analyzeResume);
router.get("/resume/analysis", getResumeAnalysis);
router.get("/jobs/recommended", getRecommendedJobs);
router.get("/skill-gap", getSkillGap);
router.post("/mock-interview/start", startMockInterview);
router.post("/mock-interview/answer", evaluateMockInterviewAnswer);
router.post("/mock-interview/next-question", getNextMockInterviewQuestion);

module.exports = router;
