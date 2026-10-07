const mongoose = require("mongoose");
const Company = require("../models/Company");
const Job = require("../models/Job");

const jobTypes = ["job", "internship"];
const jobStatuses = ["draft", "active", "closed"];
const workModes = ["onsite", "hybrid", "remote"];
const editableFields = [
  "title",
  "type",
  "description",
  "responsibilities",
  "requirements",
  "skillsRequired",
  "educationRequired",
  "experience",
  "location",
  "workMode",
  "salary",
  "stipend",
  "vacancies",
  "deadline",
  "status",
];
const textLimits = {
  title: 160,
  description: 10000,
  educationRequired: 300,
  experience: 120,
  location: 160,
  salary: 120,
  stipend: 120,
};
const requiredTextFields = ["title", "description", "location"];

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validatePayload = (body, partial = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A valid job object is required" };
  }

  const updates = {};
  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field];
    }
  }

  if (!Object.keys(updates).length) {
    return { error: "Provide at least one job field to save" };
  }

  const requiredFields = ["title", "type", "description", "location", "skillsRequired"];
  if (!partial) {
    const missing = requiredFields.find(
      (field) => !Object.prototype.hasOwnProperty.call(updates, field)
    );
    if (missing) return { error: `${missing} is required` };
  }

  for (const [field, maxLength] of Object.entries(textLimits)) {
    if (
      Object.prototype.hasOwnProperty.call(updates, field) &&
      (typeof updates[field] !== "string" ||
        updates[field].length > maxLength)
    ) {
      return { error: `${field} must be text of at most ${maxLength} characters` };
    }
  }
  for (const field of requiredTextFields) {
    if (
      Object.prototype.hasOwnProperty.call(updates, field) &&
      !updates[field].trim()
    ) {
      return { error: `${field} cannot be empty` };
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, "type") &&
    !jobTypes.includes(updates.type)
  ) {
    return { error: "Type must be either 'job' or 'internship'" };
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "status") &&
    !jobStatuses.includes(updates.status)
  ) {
    return { error: "Status must be draft, active, or closed" };
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "workMode") &&
    !workModes.includes(updates.workMode)
  ) {
    return { error: "Work mode must be onsite, hybrid, or remote" };
  }

  for (const field of ["responsibilities", "requirements", "skillsRequired"]) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    const value = updates[field];
    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      (field === "skillsRequired" && value.length === 0) ||
      !value.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length > 0 &&
          item.length <= (field === "skillsRequired" ? 100 : 1000)
      )
    ) {
      return {
        error:
          field === "skillsRequired"
            ? "Provide a list of up to 100 non-empty required skills"
            : `${field} must be a list of up to 100 non-empty text items`,
      };
    }
    updates[field] = value.map((item) => item.trim());
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, "vacancies") &&
    (!Number.isInteger(Number(updates.vacancies)) ||
      Number(updates.vacancies) < 1 ||
      Number(updates.vacancies) > 10000)
  ) {
    return { error: "Vacancies must be a whole number between 1 and 10000" };
  }
  if (Object.prototype.hasOwnProperty.call(updates, "vacancies")) {
    updates.vacancies = Number(updates.vacancies);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deadline")) {
    if (updates.deadline === null || updates.deadline === "") {
      updates.deadline = null;
    } else {
      const deadline = new Date(updates.deadline);
      if (Number.isNaN(deadline.getTime())) {
        return { error: "Deadline must be a valid date" };
      }
      updates.deadline = deadline;
    }
  }

  for (const field of ["title", "description", "location", "educationRequired", "experience", "salary", "stipend"]) {
    if (typeof updates[field] === "string") updates[field] = updates[field].trim();
  }

  return { updates };
};

const getCompanyForUser = (userId) => Company.findOne({ userId });

const getJobs = async (req, res, next) => {
  try {
    const { type, location, workMode, experience, skills, search, status } = req.query;
    const isManaging = req.query.mine === "true";

    if (type && !jobTypes.includes(type)) {
      return sendError(res, 400, "Type must be either 'job' or 'internship'");
    }
    if (workMode && !workModes.includes(workMode)) {
      return sendError(res, 400, "Work mode must be onsite, hybrid, or remote");
    }
    if (status && !jobStatuses.includes(status)) {
      return sendError(res, 400, "Status must be draft, active, or closed");
    }
    if (status && status !== "active" && !isManaging) {
      return sendError(res, 403, "Only company owners and admins can view unpublished jobs");
    }

    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 100");
    }

    const filter = {};
    if (type) filter.type = type;

    if (isManaging) {
      if (req.user.role === "company") {
        const company = await getCompanyForUser(req.user._id);
        if (!company) return sendError(res, 404, "Company profile not found");
        filter.companyId = company._id;
      }
      if (status) filter.status = status;
    } else {
      filter.status = "active";
    }

    if (location) filter.location = new RegExp(escapeRegex(String(location).trim()), "i");
    if (workMode) filter.workMode = workMode;
    if (experience) {
      filter.experience = new RegExp(escapeRegex(String(experience).trim()), "i");
    }
    if (skills) {
      const requestedSkills = String(skills)
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (requestedSkills.length > 20) {
        return sendError(res, 400, "Filter by no more than 20 skills at once");
      }
      if (requestedSkills.length) {
        filter.skillsRequired = {
          $in: requestedSkills.map(
            (skill) => new RegExp(`^${escapeRegex(skill)}$`, "i")
          ),
        };
      }
    }
    if (search) {
      const query = new RegExp(escapeRegex(String(search).trim()), "i");
      filter.$or = [
        { title: query },
        { description: query },
        { skillsRequired: query },
      ];
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("companyId", "companyName logo industry verified")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getJobById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Job not found");
    }
    const isManaging = req.query.mine === "true";
    const filter = { _id: req.params.id };
    if (!isManaging) filter.status = "active";
    const job = await Job.findOne(filter)
      .populate("companyId", "companyName logo industry website location verified")
      .lean();
    if (!job) return sendError(res, 404, "Job not found");
    if (isManaging && req.user.role === "company") {
      const company = await getCompanyForUser(req.user._id);
      if (!company || String(job.companyId._id) !== String(company._id)) {
        return sendError(res, 403, "You can only view your own job postings");
      }
    }
    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};

const createJob = async (req, res, next) => {
  try {
    const { updates, error } = validatePayload(req.body);
    if (error) return sendError(res, 400, error);

    const company = await getCompanyForUser(req.user._id);
    if (!company) return sendError(res, 404, "Company profile not found");
    if (updates.status === "active" && !company.verified) {
      return sendError(res, 403, "Your company must be verified before publishing jobs");
    }

    const job = await Job.create({ ...updates, companyId: company._id });
    const populatedJob = await Job.findById(job._id)
      .populate("companyId", "companyName logo industry verified")
      .lean();
    res.status(201).json({ success: true, data: populatedJob });
  } catch (error) {
    next(error);
  }
};

const updateJob = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Job not found");
    }
    const { updates, error } = validatePayload(req.body, true);
    if (error) return sendError(res, 400, error);

    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, "Job not found");

    if (req.user.role === "company") {
      const company = await getCompanyForUser(req.user._id);
      if (!company || !job.companyId.equals(company._id)) {
        return sendError(res, 403, "You can only manage your own job postings");
      }
      if (updates.status === "active" && !company.verified) {
        return sendError(res, 403, "Your company must be verified before publishing jobs");
      }
    }

    Object.assign(job, updates);
    await job.save();
    const updatedJob = await Job.findById(job._id)
      .populate("companyId", "companyName logo industry verified")
      .lean();
    res.json({ success: true, data: updatedJob });
  } catch (error) {
    next(error);
  }
};

const deleteJob = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 404, "Job not found");
    }
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, "Job not found");

    if (req.user.role === "company") {
      const company = await getCompanyForUser(req.user._id);
      if (!company || !job.companyId.equals(company._id)) {
        return sendError(res, 403, "You can only manage your own job postings");
      }
    }

    await job.deleteOne();
    res.json({ success: true, message: "Job posting deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = { getJobs, getJobById, createJob, updateJob, deleteJob };
