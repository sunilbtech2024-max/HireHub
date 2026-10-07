const path = require("path");
const Resume = require("../models/Resume");
const AIAnalysis = require("../models/AIAnalysis");
const { extractPdfText } = require("../services/pdfService");
const {
  removeResumeFile,
  removeTemporaryResumeFile,
  uploadResumeFile,
} = require("../services/resumeStorage");

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const resumeMetadata = (resume) => ({
  id: resume._id,
  originalName: resume.originalName,
  filename: resume.filename,
  mimeType: resume.mimeType,
  size: resume.size,
  uploadedAt: resume.uploadedAt,
  updatedAt: resume.updatedAt,
});

const uploadResume = async (req, res) => {
  if (!req.file) return sendError(res, 400, "Choose a PDF resume to upload");

  let publicId;
  let resumeSaved = false;
  try {
    const extractedText = await extractPdfText(req.file.path);
    const oldResume = await Resume.findOne({ studentId: req.user._id })
      .select("+path")
      .lean();
    const originalName = path.basename(req.file.originalname).slice(0, 255);
    publicId = await uploadResumeFile(req.file.path);

    const resume = await Resume.findOneAndUpdate(
      { studentId: req.user._id },
      {
        studentId: req.user._id,
        originalName,
        filename: req.file.filename,
        path: publicId,
        mimeType: req.file.mimetype,
        size: req.file.size,
        extractedText,
        uploadedAt: new Date(),
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    resumeSaved = true;
    await AIAnalysis.deleteMany({ studentId: req.user._id });

    if (oldResume?.path && oldResume.path !== publicId) {
      try {
        await removeResumeFile(oldResume.path);
      } catch {
        console.error("Unable to remove a replaced resume asset from Cloudinary");
      }
    }
    return res.status(201).json({
      success: true,
      message: "Resume uploaded successfully.",
      data: resumeMetadata(resume),
    });
  } catch (error) {
    try {
      if (publicId && !resumeSaved) await removeResumeFile(publicId);
    } catch {
      console.error("Unable to remove a rejected resume asset from Cloudinary");
    }
    if (error.statusCode === 422) {
      return sendError(res, 422, "Unable to extract readable text from this PDF.");
    }
    return sendError(res, 500, "We could not save your resume. Please try again.");
  } finally {
    try {
      await removeTemporaryResumeFile(req.file.path);
    } catch {
      console.error("Unable to remove a temporary resume file");
    }
  }
};

const getMyResume = async (req, res) => {
  try {
    const resume = await Resume.findOne({ studentId: req.user._id }).lean();
    if (!resume) return sendError(res, 404, "No resume uploaded yet.");
    return res.json({ success: true, data: resumeMetadata(resume) });
  } catch {
    return sendError(res, 500, "We could not load your resume. Please try again.");
  }
};

const deleteMyResume = async (req, res) => {
  try {
    const resume = await Resume.findOne({ studentId: req.user._id })
      .select("+path")
      .lean();
    if (!resume) return sendError(res, 404, "No resume uploaded yet.");
    await removeResumeFile(resume.path);
    await Resume.deleteOne({ _id: resume._id, studentId: req.user._id });
    await AIAnalysis.deleteMany({ studentId: req.user._id });
    return res.json({ success: true, message: "Resume deleted successfully." });
  } catch {
    return sendError(res, 500, "We could not delete your resume. Please try again.");
  }
};

module.exports = { uploadResume, getMyResume, deleteMyResume };
