const jwt = require("jsonwebtoken");
const getJwtSecret = require("./jwtSecret");

const generateToken = (id) => {
  return jwt.sign({ id }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = generateToken;
