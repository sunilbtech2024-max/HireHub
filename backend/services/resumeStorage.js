const fs = require("fs/promises");
const path = require("path");
const { resumeDirectory } = require("../middleware/resumeUpload");
const cloudinary = require("../config/cloudinary");

const removeTemporaryResumeFile = async (filePath) => {
  if (!filePath) return;
  const resolvedPath = path.resolve(filePath);
  if (path.dirname(resolvedPath) !== path.resolve(resumeDirectory)) return;
  await fs.rm(resolvedPath, { force: true });
};

const uploadResumeFile = async (filePath) => {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "raw",
    type: "authenticated",
    access_mode: "authenticated",
    folder: "hirehub/resumes",
    public_id: path.basename(filePath),
    overwrite: false,
    unique_filename: false,
    use_filename: false,
  });

  if (!result.public_id || result.resource_type !== "raw" || result.type !== "authenticated") {
    if (result.public_id) {
      await cloudinary.uploader.destroy(result.public_id, {
        resource_type: "raw",
        type: "authenticated",
        invalidate: true,
      });
    }
    throw new Error("Cloudinary did not store the resume as an authenticated raw asset");
  }

  return result.public_id;
};

const removeResumeFile = async (publicId) => {
  if (!publicId) return;
  const resolvedPath = path.resolve(publicId);
  if (path.dirname(resolvedPath) === path.resolve(resumeDirectory)) {
    await fs.rm(resolvedPath, { force: true });
    return;
  }

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "raw",
    type: "authenticated",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error("Cloudinary did not delete the resume asset");
  }
};

module.exports = { removeResumeFile, removeTemporaryResumeFile, uploadResumeFile };
