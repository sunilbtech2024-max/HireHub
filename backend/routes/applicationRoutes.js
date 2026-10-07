const express = require("express");
const {
  applyToJob,
  getMyApplications,
  getApplicationById,
  withdrawApplication,
  getCompanyJobs,
  getCompanyDashboard,
  updateApplicationStatus,
} = require("../controllers/applicationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorize("student"), applyToJob);
router.get("/mine", protect, authorize("student"), getMyApplications);
router.get(
  "/company/dashboard",
  protect,
  authorize("company"),
  getCompanyDashboard
);
router.get(
  "/company/jobs",
  protect,
  authorize("company", "admin"),
  getCompanyJobs
);
router.get("/:id", protect, authorize("student", "company", "admin"), getApplicationById);
router.patch("/:id/withdraw", protect, authorize("student"), withdrawApplication);
router.patch(
  "/:id/status",
  protect,
  authorize("company", "admin"),
  updateApplicationStatus
);

module.exports = router;
