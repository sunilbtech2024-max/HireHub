
const express = require("express");
const router = express.Router();

const {
  register,
  verifyRegistrationOtp,
  login,
  googleLogin,
  getMe,
  updatePassword,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/verify-otp", verifyRegistrationOtp);
router.post("/login", login);
router.post("/google", googleLogin);
router.get("/me", protect, getMe);
router.put("/update-password", protect, updatePassword);

module.exports = router;
