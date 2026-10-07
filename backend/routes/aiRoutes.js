const express = require("express");
const {
  analyzeResume,
  getResumeAnalysis,
  getRecommendedJobs,
} = require("../controllers/aiController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, authorize("student"));
router.post("/resume/analyze", analyzeResume);
router.get("/resume/analysis", getResumeAnalysis);
router.get("/jobs/recommended", getRecommendedJobs);

module.exports = router;
