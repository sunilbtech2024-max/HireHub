const express = require("express");
const {
  getJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
} = require("../controllers/jobController");
const { getJobApplications } = require("../controllers/applicationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const protectJobList = (req, res, next) => {
  if (req.query.mine === "true") return protect(req, res, next);
  next();
};

const authorizeJobList = (req, res, next) => {
  if (req.query.mine === "true") {
    return authorize("company", "admin")(req, res, next);
  }
  next();
};

router.get("/", protectJobList, authorizeJobList, getJobs);
router.get(
  "/:jobId/applications",
  protect,
  authorize("company", "admin"),
  getJobApplications
);
router.get("/:id", protectJobList, authorizeJobList, getJobById);
router.post("/", protect, authorize("company"), createJob);
router.put("/:id", protect, authorize("company", "admin"), updateJob);
router.delete("/:id", protect, authorize("company", "admin"), deleteJob);

module.exports = router;
