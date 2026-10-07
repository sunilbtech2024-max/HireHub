const express = require("express");
const {
  getDashboard,
  getUsers,
  getCompanies,
  reviewCompanyVerification,
  getJobs,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const adminOnly = [protect, authorize("admin")];

router.get("/dashboard", ...adminOnly, getDashboard);
router.get("/users", ...adminOnly, getUsers);
router.get("/companies", ...adminOnly, getCompanies);
router.patch("/companies/:id/verification", ...adminOnly, reviewCompanyVerification);
router.get("/jobs", ...adminOnly, getJobs);

module.exports = router;
