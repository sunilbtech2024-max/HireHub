const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const resumeDirectory = path.join(__dirname, "..", "uploads", "resumes");
fs.mkdirSync(resumeDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, resumeDirectory),
  filename: (_req, _file, callback) =>
    callback(null, `resume-${crypto.randomUUID()}.pdf`),
});

const uploadResumeFile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (
      path.extname(file.originalname).toLowerCase() !== ".pdf" ||
      file.mimetype !== "application/pdf"
    ) {
      const error = new Error("Only PDF resumes are allowed");
      error.statusCode = 422;
      return callback(error);
    }
    callback(null, true);
  },
}).single("resume");

const handleResumeUpload = (req, res, next) => {
  uploadResumeFile(req, res, (error) => {
    if (!error) return next();
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.statusCode || 400;
    return res.status(status).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Resume must be 5 MB or smaller"
          : error.message || "Invalid resume upload",
    });
  });
};

module.exports = { handleResumeUpload, resumeDirectory };
