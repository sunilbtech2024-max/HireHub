const jwt = require("jsonwebtoken");
const User = require("../models/User");
const getJwtSecret = require("../utils/jwtSecret");

// Protect routes - JWT verification
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, getJwtSecret());

      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found or account removed",
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: "This account has been disabled. Please contact support.",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed or expired",
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
    });
  }
};

// Role-based authorization guard
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user ? req.user.role : "unknown"}' is not authorized to access this resource`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
