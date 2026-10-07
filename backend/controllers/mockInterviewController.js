const AIAnalysis = require("../models/AIAnalysis");
const interviewService = require("../services/mockInterviewService");
const { MockInterviewValidationError } = interviewService;

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const validateRequest = (body, allowedFields) => {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowedFields.includes(key))
  ) {
    return "The mock interview request is invalid.";
  }
  return "";
};

const getStudentSkills = async (studentId) => {
  const analysis = await AIAnalysis.findOne({ studentId })
    .select("skills technicalSkills softSkills")
    .lean();
  if (!analysis) return [];
  return [
    ...(analysis.skills || []),
    ...(analysis.technicalSkills || []),
    ...(analysis.softSkills || []),
  ];
};

const handleServiceError = (res, error, fallback) => {
  if (error instanceof MockInterviewValidationError) {
    return sendError(res, 400, error.message);
  }
  return sendError(
    res,
    error.statusCode || 500,
    error.statusCode ? error.message : fallback
  );
};

const startMockInterview = async (req, res) => {
  const invalid = validateRequest(req.body, ["interviewType", "targetRole"]);
  if (invalid) return sendError(res, 400, invalid);

  try {
    const skills = await getStudentSkills(req.user._id);
    const question = await interviewService.generateQuestion({
      interviewType: req.body.interviewType,
      targetRole: req.body.targetRole,
      skills,
      questionNumber: 1,
      previousQuestions: [],
    });
    return res.json({
      success: true,
      data: { questionNumber: 1, totalQuestions: interviewService.MAX_QUESTIONS, question },
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      "We could not start your mock interview. Please try again."
    );
  }
};

const evaluateMockInterviewAnswer = async (req, res) => {
  const invalid = validateRequest(req.body, [
    "interviewType",
    "targetRole",
    "question",
    "answer",
  ]);
  if (invalid) return sendError(res, 400, invalid);

  try {
    const evaluation = await interviewService.evaluateAnswer(req.body);
    return res.json({ success: true, data: evaluation });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      "We could not evaluate your answer. Please try again."
    );
  }
};

const getNextMockInterviewQuestion = async (req, res) => {
  const invalid = validateRequest(req.body, [
    "interviewType",
    "targetRole",
    "questionNumber",
    "previousQuestions",
  ]);
  if (invalid) return sendError(res, 400, invalid);

  try {
    const skills = await getStudentSkills(req.user._id);
    const question = await interviewService.generateQuestion({
      ...req.body,
      skills,
    });
    return res.json({
      success: true,
      data: { questionNumber: req.body.questionNumber, question },
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      "We could not generate the next question. Please try again."
    );
  }
};

module.exports = {
  evaluateMockInterviewAnswer,
  getNextMockInterviewQuestion,
  startMockInterview,
};
