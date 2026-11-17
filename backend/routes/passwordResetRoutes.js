const express = require("express");

const {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} = require("../controllers/passwordResetController");

const router = express.Router();

router.post("/forgot-password", requestPasswordReset);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

module.exports = router;
