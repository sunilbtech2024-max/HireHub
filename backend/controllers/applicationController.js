const mongoose = require("mongoose");
const Application = require("../models/Application");
const Company = require("../models/Company");
const Job = require("../models/Job");
const { createNotification } = require("../services/notificationService");

const applicationStatuses = [
  "applied",
  "under_review",
  "shortlisted",
  "interview",
  "selected",
  "rejected",
  "withdrawn",
];
const companyStatuses = ["under_review", "shortlisted", "interview", "selected", "rejected"];
const coverLetterLimit = 5000;
const resumeFileNameLimit = 255;
const resumeFileUrlLimit = 2048;

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const populateApplication = (query) =>
  query
    .populate({
      path: "jobId",
      select:
        "title type description responsibilities requirements skillsRequired educationRequired experience location workMode salary stipend vacancies deadline status createdAt companyId",
      populate: {
        path: "companyId",
        select: "companyName logo industry website location",
      },
    })
    .populate("studentId", "name email phone profileImage")
    .populate("companyId", "name email");

const validateResume = (resume) => {
  if (resume === undefined || resume === null) return { resume: undefined };
  if (
    typeof resume !== "object" ||
    Array.isArray(resume) ||
    typeof resume.fileName !== "string" ||
    typeof resume.fileUrl !== "string"
  ) {
    return { error: "Resume must include a file name and a secure file URL" };
  }

  const fileName = resume.fileName.trim();
  const fileUrl = resume.fileUrl.trim();
  const isSafeUrl =
    fileUrl.startsWith("/uploads/") || /^https:\/\/\S+$/i.test(fileUrl);

  if (!fileName || fileName.length > resumeFileNameLimit) {
    return { error: `Resume file name must be between 1 and ${resumeFileNameLimit} characters` };
  }
  if (!fileUrl || fileUrl.length > resumeFileUrlLimit || !isSafeUrl) {
    return { error: "Resume URL must be a secure HTTPS URL or an uploaded HireHub file" };
  }

  return { resume: { fileName, fileUrl } };
};

const getCompanyJob = async (jobId, req, res) => {
  const job = await Job.findById(jobId);
  if (!job) {
    sendError(res, 404, "Job not found");
    return null;
  }

  if (req.user.role === "company") {
    const company = await Company.findOne({ userId: req.user._id });
    if (!company) {
      sendError(res, 404, "Company profile not found");
      return null;
    }
    if (!job.companyId.equals(company._id)) {
      sendError(res, 403, "You can only access applicants for your own job postings");
      return null;
    }
  }

  return job;
};

const companyOwnsApplicationJob = async (application, req, res) => {
  const company = await Company.findOne({ userId: req.user._id });
  if (!company) {
    sendError(res, 404, "Company profile not found");
    return false;
  }
  const job = await Job.findById(application.jobId).select("companyId");
  if (!job) {
    sendError(res, 404, "Job not found");
    return false;
  }
  if (!job.companyId.equals(company._id)) {
    sendError(res, 403, "You can only access applications for your own job postings");
    return false;
  }
  return true;
};

const applyToJob = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { jobId, coverLetter = "" } = body;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, "A valid job ID is required");
    }
    if (typeof coverLetter !== "string" || coverLetter.length > coverLetterLimit) {
      return sendError(
        res,
        422,
        `Cover letter must be text with no more than ${coverLetterLimit} characters`
      );
    }

    const resumeResult = validateResume(body.resume);
    if (resumeResult.error) return sendError(res, 422, resumeResult.error);

    const job = await Job.findById(jobId).select("title companyId status");
    if (!job) return sendError(res, 404, "Job not found");
    if (job.status !== "active") {
      return sendError(res, 409, "This job is not accepting applications");
    }

    const company = await Company.findById(job.companyId).select("userId");
    if (!company) return sendError(res, 409, "The company for this job is unavailable");

    const application = await Application.create({
      jobId: job._id,
      studentId: req.user._id,
      companyId: company.userId,
      resume: resumeResult.resume,
      coverLetter: coverLetter.trim(),
      status: "applied",
      statusHistory: [{ status: "applied", changedBy: req.user._id }],
    });

    await createNotification({
      recipientId: company.userId,
      type: "APPLICATION_SUBMITTED",
      title: "New application received",
      message: `A student has applied for your ${job.title} position.`,
      link: `/company/jobs/${job._id}/applications`,
      relatedId: application._id,
      relatedModel: "Application",
      eventKey: `application:${application._id}:submitted`,
    });

    const populated = await populateApplication(
      Application.findById(application._id)
    ).lean();
    res.status(201).json({
      success: true,
      message: "Application submitted successfully.",
      data: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "You have already applied to this opportunity");
    }
    next(error);
  }
};

const getMyApplications = async (req, res, next) => {
  try {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 50
    ) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 50");
    }

    const filter = { studentId: req.user._id };
    if (req.query.jobId) {
      if (!mongoose.isValidObjectId(req.query.jobId)) {
        return sendError(res, 400, "Invalid job ID");
      }
      filter.jobId = req.query.jobId;
    }

    const [applications, total] = await Promise.all([
      populateApplication(
        Application.find(filter)
          .sort({ appliedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
      ).lean(),
      Application.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: applications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getApplicationById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Application not found");
    }

    const application = await populateApplication(
      Application.findById(req.params.id)
    ).lean();
    if (!application) return sendError(res, 404, "Application not found");

    if (
      req.user.role === "student" &&
      (!application.studentId ||
        !application.studentId._id.equals(req.user._id))
    ) {
      return sendError(res, 403, "You can only view your own applications");
    }
    if (
      req.user.role === "company" &&
      !(await companyOwnsApplicationJob(application, req, res))
    ) {
      return;
    }

    res.json({ success: true, data: application });
  } catch (error) {
    next(error);
  }
};

const withdrawApplication = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Application not found");
    }

    const application = await Application.findById(req.params.id);
    if (!application) return sendError(res, 404, "Application not found");
    if (!application.studentId.equals(req.user._id)) {
      return sendError(res, 403, "You can only withdraw your own applications");
    }
    if (["selected", "rejected", "withdrawn"].includes(application.status)) {
      return sendError(res, 409, "This application can no longer be withdrawn");
    }

    const job = await Job.findById(application.jobId).select("title");
    application.status = "withdrawn";
    application.statusHistory.push({
      status: "withdrawn",
      changedBy: req.user._id,
    });
    await application.save();

    await createNotification({
      recipientId: application.companyId,
      type: "APPLICATION_WITHDRAWN",
      title: "Application withdrawn",
      message: `A student withdrew their application for ${job?.title || "your job"}.`,
      link: `/company/jobs/${application.jobId}/applications`,
      relatedId: application._id,
      relatedModel: "Application",
      eventKey: `application:${application._id}:withdrawn`,
    });

    const populated = await populateApplication(
      Application.findById(application._id)
    ).lean();
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

const getJobApplications = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.jobId)) {
      return sendError(res, 404, "Job not found");
    }
    const job = await getCompanyJob(req.params.jobId, req, res);
    if (!job) return;

    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 50
    ) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 50");
    }

    const filter = { jobId: job._id };
    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("studentId", "name email phone profileImage")
        .populate("companyId", "name email")
        .sort({ appliedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter),
    ]);

    res.json({
      success: true,
      job: {
        _id: job._id,
        title: job.title,
        type: job.type,
        location: job.location,
        workMode: job.workMode,
      },
      data: applications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getCompanyJobs = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === "company") {
      const company = await Company.findOne({ userId: req.user._id });
      if (!company) return sendError(res, 404, "Company profile not found");
      filter.companyId = company._id;
    }

    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 50
    ) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 50");
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("companyId", "companyName logo")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter),
    ]);

    const counts = await Application.aggregate([
      { $match: { jobId: { $in: jobs.map((job) => job._id) } } },
      { $group: { _id: "$jobId", total: { $sum: 1 } } },
    ]);
    const countByJobId = new Map(
      counts.map((count) => [String(count._id), count.total])
    );

    res.json({
      success: true,
      data: jobs.map((job) => ({
        ...job,
        applicantCount: countByJobId.get(String(job._id)) || 0,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getCompanyDashboard = async (req, res, next) => {
  try {
    const company = await Company.findOne({ userId: req.user._id })
      .select("companyName logo description website industry location companySize verified verificationStatus verificationRequestedAt")
      .lean();
    if (!company) return sendError(res, 404, "Company profile not found");

    const [
      totalJobs,
      activeJobs,
      draftJobs,
      totalApplications,
      jobs,
      recentApplicants,
    ] = await Promise.all([
      Job.countDocuments({ companyId: company._id }),
      Job.countDocuments({ companyId: company._id, status: "active" }),
      Job.countDocuments({ companyId: company._id, status: "draft" }),
      Application.countDocuments({ companyId: req.user._id }),
      Job.find({ companyId: company._id })
        .populate("companyId", "companyName logo")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Application.find({ companyId: req.user._id })
        .populate("studentId", "name email profileImage")
        .populate({
          path: "jobId",
          select: "title type location companyId",
          populate: { path: "companyId", select: "companyName logo" },
        })
        .sort({ appliedAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const applicationCounts = await Application.aggregate([
      { $match: { jobId: { $in: jobs.map((job) => job._id) } } },
      { $group: { _id: "$jobId", total: { $sum: 1 } } },
    ]);
    const countByJobId = new Map(
      applicationCounts.map((item) => [String(item._id), item.total])
    );

    res.json({
      success: true,
      data: {
        company,
        stats: {
          totalJobs,
          activeJobs,
          draftJobs,
          totalApplications,
        },
        recentJobs: jobs.map((job) => ({
          ...job,
          applicantCount: countByJobId.get(String(job._id)) || 0,
        })),
        recentApplicants,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateApplicationStatus = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Application not found");
    }
    const { status } = req.body || {};
    if (!applicationStatuses.includes(status) || !companyStatuses.includes(status)) {
      return sendError(
        res,
        422,
        `Status must be one of: ${companyStatuses.join(", ")}`
      );
    }

    const application = await Application.findById(req.params.id);
    if (!application) return sendError(res, 404, "Application not found");
    if (
      req.user.role === "company" &&
      !(await companyOwnsApplicationJob(application, req, res))
    ) {
      return;
    }
    if (
      req.user.role === "company" &&
      ["withdrawn", "rejected", "selected"].includes(application.status)
    ) {
      return sendError(res, 409, "This application has reached a final status");
    }

    const statusChanged = application.status !== status;
    const job = statusChanged
      ? await Job.findById(application.jobId).select("title")
      : null;
    application.status = status;
    application.statusHistory.push({ status, changedBy: req.user._id });
    await application.save();

    if (statusChanged) {
      const readableStatus = status.replaceAll("_", " ");
      await createNotification({
        recipientId: application.studentId,
        type: "APPLICATION_STATUS_CHANGED",
        title: "Application status updated",
        message: `Your application for ${job?.title || "a job"} ${status === "rejected" ? "was rejected" : `is now ${readableStatus}`}.`,
        link: `/applications/${application._id}`,
        relatedId: application._id,
        relatedModel: "Application",
        eventKey: `application:${application._id}:status:${application.statusHistory[application.statusHistory.length - 1].changedAt.getTime()}`,
      });
    }

    const populated = await populateApplication(
      Application.findById(application._id)
    ).lean();
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyToJob,
  getMyApplications,
  getApplicationById,
  withdrawApplication,
  getJobApplications,
  getCompanyJobs,
  getCompanyDashboard,
  updateApplicationStatus,
};
