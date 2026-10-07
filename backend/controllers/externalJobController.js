const ScrapedJob = require("../models/ScrapedJob");

const workModes = ["onsite", "hybrid", "remote"];
const maxLimit = 100;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getExternalJobs = async (req, res, next) => {
  try {
    const { search, location, workMode, skills } = req.query;
    if (workMode && !workModes.includes(workMode)) {
      return sendError(res, 400, "Work mode must be onsite, hybrid, or remote");
    }
    if (
      (search !== undefined &&
        (typeof search !== "string" || search.length > 200)) ||
      (location !== undefined &&
        (typeof location !== "string" || location.length > 120)) ||
      (skills !== undefined && typeof skills !== "string")
    ) {
      return sendError(res, 400, "One or more external job filters are invalid");
    }

    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > maxLimit
    ) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 100");
    }

    const filter = {
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    if (location?.trim()) {
      filter.location = new RegExp(escapeRegex(location.trim()), "i");
    }
    if (workMode) filter.workMode = workMode;

    if (skills !== undefined) {
      const requestedSkills = skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (requestedSkills.length > 20 || requestedSkills.some((skill) => skill.length > 100)) {
        return sendError(res, 400, "Filter by no more than 20 skills of up to 100 characters");
      }
      if (requestedSkills.length) {
        filter.skillsRequired = {
          $in: requestedSkills.map(
            (skill) => new RegExp(`^${escapeRegex(skill)}$`, "i")
          ),
        };
      }
    }

    if (search?.trim()) {
      const query = new RegExp(escapeRegex(search.trim()), "i");
      filter.$and = [
        {
          $or: [
            { title: query },
            { companyName: query },
            { description: query },
            { skillsRequired: query },
          ],
        },
      ];
    }

    const [jobs, total] = await Promise.all([
      ScrapedJob.find(filter)
        .select(
          "source sourceJobId title companyName description responsibilities requirements skillsRequired location workMode employmentType salary sourceUrl postedAt expiresAt createdAt"
        )
        .sort({ postedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ScrapedJob.countDocuments(filter),
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

module.exports = { getExternalJobs };
