const Resume = require("../models/Resume");
const AIAnalysis = require("../models/AIAnalysis");
const Job = require("../models/Job");
const { analyzeResumeText } = require("../services/geminiService");
const { matchJob } = require("../services/jobMatchingService");

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const analysisResponse = (analysis) => {
  const data = analysis.toObject ? analysis.toObject() : analysis;
  delete data.studentId;
  delete data.resumeId;
  delete data.__v;
  return data;
};

const analyzeResume = async (req, res) => {
  try {
    const resume = await Resume.findOne({ studentId: req.user._id }).select(
      "+extractedText"
    );
    if (!resume) return sendError(res, 404, "Upload a resume before analyzing it.");

    const existing = await AIAnalysis.findOne({
      studentId: req.user._id,
      resumeId: resume._id,
    });
    const reanalyze = req.body?.reanalyze === true;
    if (
      existing &&
      existing.analyzedAt >= resume.updatedAt &&
      !reanalyze
    ) {
      return res.json({
        success: true,
        cached: true,
        data: analysisResponse(existing),
      });
    }

    const { data, model } = await analyzeResumeText(resume.extractedText);
    const analysis = await AIAnalysis.findOneAndUpdate(
      { resumeId: resume._id },
      {
        ...data,
        studentId: req.user._id,
        resumeId: resume._id,
        model,
        analyzedAt: new Date(),
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, cached: false, data: analysisResponse(analysis) });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.statusCode, error.message);
    }
    return sendError(res, 500, "We could not analyze your resume. Please try again.");
  }
};

const getResumeAnalysis = async (req, res) => {
  try {
    const resume = await Resume.findOne({ studentId: req.user._id }).select("_id");
    if (!resume) return sendError(res, 404, "Upload a resume before viewing its analysis.");
    const analysis = await AIAnalysis.findOne({
      studentId: req.user._id,
      resumeId: resume._id,
    }).lean();
    if (!analysis) return sendError(res, 404, "No resume analysis is available yet.");
    return res.json({ success: true, data: analysisResponse(analysis) });
  } catch {
    return sendError(res, 500, "We could not load your resume analysis.");
  }
};

const getRecommendedJobs = async (req, res) => {
  try {
    const resume = await Resume.findOne({ studentId: req.user._id }).select("_id");
    if (!resume) return sendError(res, 404, "Upload a resume to get job recommendations.");
    const analysis = await AIAnalysis.findOne({
      studentId: req.user._id,
      resumeId: resume._id,
    }).lean();
    if (!analysis) return sendError(res, 404, "Analyze your resume to get job recommendations.");

    const jobs = await Job.find({ status: "active" })
      .populate("companyId", "companyName logo industry verified")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    const recommendations = jobs
      .map((job) => ({ ...job, ...matchJob(job, analysis) }))
      .sort((left, right) => right.matchScore - left.matchScore);
    return res.json({ success: true, data: recommendations });
  } catch {
    return sendError(res, 500, "We could not load recommended jobs.");
  }
};

module.exports = { analyzeResume, getResumeAnalysis, getRecommendedJobs };
