const express = require("express");
const { updateProfile } = require("../controllers/userController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.put("/profile", protect, authorize("student"), updateProfile);

module.exports = router;
