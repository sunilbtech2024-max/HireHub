const express = require("express");
const {
  uploadResume,
  getMyResume,
  deleteMyResume,
} = require("../controllers/resumeController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { handleResumeUpload } = require("../middleware/resumeUpload");

const router = express.Router();

router.use(protect, authorize("student"));
router.post("/", handleResumeUpload, uploadResume);
router.get("/mine", getMyResume);
router.delete("/mine", deleteMyResume);

module.exports = router;
