const express = require("express");
const {
  updateProfile,
  requestVerification,
} = require("../controllers/companyController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.put("/profile", protect, authorize("company"), updateProfile);
router.post("/verification-request", protect, authorize("company"), requestVerification);

module.exports = router;
