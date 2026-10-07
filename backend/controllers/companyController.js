const Company = require("../models/Company");
const User = require("../models/User");
const { createNotifications } = require("../services/notificationService");

const editableFields = [
  "companyName",
  "description",
  "website",
  "industry",
  "location",
  "companySize",
];
const allowedSizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const fieldLimits = {
  companyName: 160,
  description: 2000,
  website: 300,
  industry: 120,
  location: 160,
};

const findCompany = (userId) => Company.findOne({ userId });

const updateProfile = async (req, res, next) => {
  try {
    const company = await findCompany(req.user._id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    const hasProfileChanges = editableFields.some((field) =>
      Object.prototype.hasOwnProperty.call(req.body, field)
    );
    if (!hasProfileChanges) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one company profile field to update",
      });
    }

    for (const field of editableFields) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
      const value = req.body[field];
      if (typeof value !== "string" || value.length > (fieldLimits[field] || 20)) {
        return res.status(400).json({
          success: false,
          message: `${field} must be text within the allowed length`,
        });
      }
      company[field] = value.trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "companySize")) {
      if (!allowedSizes.includes(req.body.companySize)) {
        return res.status(400).json({
          success: false,
          message: "Select a valid company size",
        });
      }
      company.companySize = req.body.companySize;
    }

    if (!company.companyName) {
      return res.status(400).json({
        success: false,
        message: "Company name is required",
      });
    }

    await company.save();
    res.json({ success: true, company });
  } catch (error) {
    next(error);
  }
};

const requestVerification = async (req, res, next) => {
  try {
    const company = await findCompany(req.user._id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    if (company.verified) {
      return res.status(409).json({
        success: false,
        message: "This company has already been verified",
      });
    }

    const missingFields = [
      ["companyName", company.companyName],
      ["industry", company.industry],
      ["website", company.website],
      ["location", company.location],
      ["description", company.description],
    ]
      .filter(([, value]) => !value?.trim())
      .map(([field]) => field);

    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message: `Complete these company profile fields before requesting verification: ${missingFields.join(", ")}`,
      });
    }

    const admins = await User.find({ role: "admin", isActive: true }).select("_id").lean();
    company.verificationStatus = "pending";
    company.verificationRequestedAt = new Date();
    await company.save();

    await createNotifications(
      admins.map((admin) => admin._id),
      {
        type: "COMPANY_VERIFICATION_REQUESTED",
        title: "Company verification requested",
        message: `${company.companyName} submitted a verification request.`,
        link: "/admin/dashboard#admin-companies",
        relatedId: company._id,
        relatedModel: "Company",
        eventKey: `company:${company._id}:verification-request:${company.verificationRequestedAt.getTime()}`,
      }
    );

    res.json({
      success: true,
      message: "Your verification request has been submitted for admin review",
      company,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateProfile, requestVerification };
