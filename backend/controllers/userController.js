const User = require("../models/User");

const profileFields = ["name", "phone", "headline", "bio", "location", "skills", "education", "experience"];

const isText = (value, maxLength) =>
  typeof value === "string" && value.length <= maxLength;

const validateTextArray = (value, maxItems, maxLength) =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  value.every((item) => isText(item, maxLength));

const validateEntries = (entries, fields, maxItems) =>
  Array.isArray(entries) &&
  entries.length <= maxItems &&
  entries.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Object.entries(entry).every(
        ([key, value]) =>
          fields.includes(key) &&
          (key === "current"
            ? typeof value === "boolean"
            : isText(value, 2000))
      )
  );

const updateProfile = async (req, res, next) => {
  try {
    const updates = {};
    for (const field of profileFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one profile field to update",
      });
    }

    const textLimits = {
      name: 100,
      phone: 30,
      headline: 160,
      bio: 1000,
      location: 120,
    };

    for (const [field, maxLength] of Object.entries(textLimits)) {
      if (
        Object.prototype.hasOwnProperty.call(updates, field) &&
        !isText(updates[field], maxLength)
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} must be text with no more than ${maxLength} characters`,
        });
      }
    }

    if (
      updates.name !== undefined &&
      !updates.name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty",
      });
    }

    if (
      updates.skills !== undefined &&
      !validateTextArray(updates.skills, 50, 60)
    ) {
      return res.status(400).json({
        success: false,
        message: "Skills must be a list of up to 50 text items",
      });
    }

    const educationFields = ["degree", "fieldOfStudy", "institution", "startYear", "endYear", "grade"];
    if (
      updates.education !== undefined &&
      !validateEntries(updates.education, educationFields, 20)
    ) {
      return res.status(400).json({
        success: false,
        message: "Education must contain up to 20 valid entries",
      });
    }

    const experienceFields = ["title", "company", "location", "startDate", "endDate", "current", "description"];
    if (
      updates.experience !== undefined &&
      !validateEntries(updates.experience, experienceFields, 20)
    ) {
      return res.status(400).json({
        success: false,
        message: "Experience must contain up to 20 valid entries",
      });
    }

    if (updates.skills) {
      updates.skills = updates.skills.map((skill) => skill.trim()).filter(Boolean);
    }
    if (updates.name) updates.name = updates.name.trim();

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateProfile };
