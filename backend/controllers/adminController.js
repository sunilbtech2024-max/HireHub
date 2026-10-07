const mongoose = require("mongoose");
const Application = require("../models/Application");
const Company = require("../models/Company");
const Job = require("../models/Job");
const User = require("../models/User");
const { createNotification } = require("../services/notificationService");

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getPagination = (query) => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 50
  ) {
    return { error: "Page must be positive and limit must be between 1 and 50" };
  }
  return { page, limit, skip: (page - 1) * limit };
};

const getDashboard = async (_req, res, next) => {
  try {
    const [
      totalUsers,
      totalStudents,
      totalCompanies,
      totalJobs,
      totalInternships,
      activeListings,
      totalApplications,
      pendingCompanyVerifications,
      applicationStatuses,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "company" }),
      Job.countDocuments({ type: "job" }),
      Job.countDocuments({ type: "internship" }),
      Job.countDocuments({ status: "active" }),
      Application.countDocuments(),
      Company.countDocuments({ verificationStatus: "pending" }),
      Application.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalStudents,
          totalCompanies,
          totalJobs,
          totalInternships,
          activeListings,
          totalApplications,
          pendingCompanyVerifications,
        },
        applicationStatuses: Object.fromEntries(
          applicationStatuses.map(({ _id, count }) => [_id, count])
        ),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query);
    if (pagination.error) return sendError(res, 400, pagination.error);

    const filter = {};
    if (req.query.role) {
      if (!["student", "company", "admin"].includes(req.query.role)) {
        return sendError(res, 400, "Role must be student, company, or admin");
      }
      filter.role = req.query.role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name email role isActive createdAt")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page: pagination.page, limit: pagination.limit, total },
    });
  } catch (error) {
    next(error);
  }
};

const getCompanies = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query);
    if (pagination.error) return sendError(res, 400, pagination.error);

    const filter = {};
    if (req.query.status) {
      if (!["pending", "verified", "rejected"].includes(req.query.status)) {
        return sendError(res, 400, "Status must be pending, verified, or rejected");
      }
      filter.verificationStatus = req.query.status;
    }

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .select(
          "companyName industry location verified verificationStatus verificationRequestedAt createdAt userId"
        )
        .populate("userId", "name email isActive")
        .sort({ verificationRequestedAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      Company.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: companies,
      pagination: { page: pagination.page, limit: pagination.limit, total },
    });
  } catch (error) {
    next(error);
  }
};

const reviewCompanyVerification = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Company not found");
    }

    const { status, notes = "" } = req.body || {};
    if (!["verified", "rejected"].includes(status)) {
      return sendError(res, 422, "Status must be verified or rejected");
    }
    if (typeof notes !== "string" || notes.length > 1000) {
      return sendError(res, 422, "Verification notes must be text of at most 1000 characters");
    }

    const company = await Company.findById(req.params.id);
    if (!company) return sendError(res, 404, "Company not found");
    if (company.verificationStatus !== "pending") {
      return sendError(res, 409, "Only pending verification requests can be reviewed");
    }

    company.verificationStatus = status;
    company.verified = status === "verified";
    company.verificationNotes = notes.trim();
    await company.save();

    await createNotification({
      recipientId: company.userId,
      type: "COMPANY_VERIFICATION_UPDATED",
      title: status === "verified" ? "Company verification approved" : "Company verification update",
      message:
        status === "verified"
          ? "Your company verification request has been approved."
          : "Your company verification request was rejected. Review your company profile and contact support if you need help.",
      link: "/account",
      relatedId: company._id,
      relatedModel: "Company",
      eventKey: `company:${company._id}:verification-decision:${company.updatedAt.getTime()}`,
    });

    res.json({
      success: true,
      data: {
        _id: company._id,
        companyName: company.companyName,
        verified: company.verified,
        verificationStatus: company.verificationStatus,
        verificationNotes: company.verificationNotes,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getJobs = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query);
    if (pagination.error) return sendError(res, 400, pagination.error);

    const filter = {};
    if (req.query.type) {
      if (!["job", "internship"].includes(req.query.type)) {
        return sendError(res, 400, "Type must be job or internship");
      }
      filter.type = req.query.type;
    }
    if (req.query.status) {
      if (!["draft", "active", "closed"].includes(req.query.status)) {
        return sendError(res, 400, "Status must be draft, active, or closed");
      }
      filter.status = req.query.status;
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .select("title type status createdAt companyId")
        .populate("companyId", "companyName")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      Job.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: jobs,
      pagination: { page: pagination.page, limit: pagination.limit, total },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getUsers,
  getCompanies,
  reviewCompanyVerification,
  getJobs,
};
