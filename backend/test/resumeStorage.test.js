require("dotenv").config({ quiet: true });
require("dns").setServers(["8.8.8.8", "8.8.4.4"]);

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { after, test } = require("node:test");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Resume = require("../models/Resume");
const { resumeDirectory } = require("../middleware/resumeUpload");
const { uploadResume, deleteMyResume } = require("../controllers/resumeController");

const mongoUri = process.env.MONGO_URI;
const originalUpload = cloudinary.uploader.upload;
const originalDestroy = cloudinary.uploader.destroy;
const operations = [];
let dbName;

const makePdf = () => {
  const stream = Buffer.from("BT /F1 12 Tf 72 720 Td (QA Resume) Tj ET\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream.toString("ascii")}endstream`,
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk);
    length += chunk.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  xref += `startxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeUpload = async (studentId) => {
  const filename = `resume-${crypto.randomUUID()}.pdf`;
  const filePath = path.join(resumeDirectory, filename);
  const content = makePdf();
  await fs.writeFile(filePath, content);
  return {
    req: {
      user: { _id: studentId },
      file: {
        path: filePath,
        filename,
        originalname: "qa-resume.pdf",
        mimetype: "application/pdf",
        size: content.length,
      },
    },
    filePath,
  };
};

test("resume uploads use private Cloudinary assets and clean up temporary files", {
  skip: !mongoUri,
}, async (t) => {
  dbName = `hirehub_resume_qa_${crypto.randomBytes(5).toString("hex")}`;
  await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 20000 });
  assert.equal(mongoose.connection.name, dbName);
  await Resume.init();

  const studentId = new mongoose.Types.ObjectId();
  const uploadedIds = [];
  cloudinary.uploader.upload = async (filePath, options) => {
    assert.equal(await fs.readFile(filePath).then(Boolean), true);
    operations.push({ type: "upload", options });
    const publicId = `${options.folder}/${options.public_id}`;
    uploadedIds.push(publicId);
    return {
      public_id: publicId,
      resource_type: options.resource_type,
      type: options.type,
      access_mode: options.access_mode,
      secure_url: "https://must-not-be-saved.example/resume.pdf",
    };
  };
  cloudinary.uploader.destroy = async (publicId, options) => {
    operations.push({ type: "destroy", publicId, options });
    return { result: "ok" };
  };

  try {
    await t.test("initial upload stores private asset id and extracted text", async () => {
      const { req, filePath } = await makeUpload(studentId);
      const res = makeResponse();
      await uploadResume(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.data.filename, req.file.filename);
      assert.equal("path" in res.body.data, false);
      assert.equal(JSON.stringify(res.body).includes("must-not-be-saved"), false);
      assert.equal(await fs.stat(filePath).then(() => true, () => false), false);

      const record = await Resume.findOne({ studentId }).select("+path +extractedText").lean();
      assert.equal(record.path, uploadedIds[0]);
      assert.match(record.extractedText, /QA Resume/);
      assert.deepEqual(operations[0].options, {
        resource_type: "raw",
        type: "authenticated",
        access_mode: "authenticated",
        folder: "hirehub/resumes",
        public_id: req.file.filename,
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      });
    });

    await t.test("replacement uploads and saves new asset before deleting old", async () => {
      operations.length = 0;
      const oldId = "hirehub/resumes/old-resume.pdf";
      await Resume.findOneAndUpdate(
        { studentId },
        {
          studentId,
          originalName: "old-resume.pdf",
          filename: "old-resume.pdf",
          path: oldId,
          mimeType: "application/pdf",
          size: 10,
          extractedText: "old resume",
        },
        { upsert: true, runValidators: true }
      );
      cloudinary.uploader.destroy = async (publicId, options) => {
        const current = await Resume.findOne({ studentId }).select("+path").lean();
        assert.equal(current.path, uploadedIds[1]);
        operations.push({ type: "destroy", publicId, options });
        return { result: "ok" };
      };
      const { req, filePath } = await makeUpload(studentId);
      const res = makeResponse();
      await uploadResume(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(await fs.stat(filePath).then(() => true, () => false), false);
      assert.deepEqual(operations.map((operation) => operation.type), ["upload", "destroy"]);
      assert.equal(operations[1].publicId, oldId);
      assert.equal(operations[1].options.resource_type, "raw");
      assert.equal(operations[1].options.type, "authenticated");
    });

    await t.test("delete removes Cloudinary asset and Resume record", async () => {
      const record = await Resume.findOne({ studentId }).select("+path").lean();
      operations.length = 0;
      const res = makeResponse();
      await deleteMyResume({ user: { _id: studentId } }, res);

      assert.equal(res.statusCode, 200);
      assert.equal(operations[0].type, "destroy");
      assert.equal(operations[0].publicId, record.path);
      assert.equal(operations[0].options.resource_type, "raw");
      assert.equal(operations[0].options.type, "authenticated");
      assert.equal(await Resume.countDocuments({ studentId }), 0);
    });

    await t.test("failed PDF extraction still removes temporary file", async () => {
      const { req, filePath } = await makeUpload(studentId);
      await fs.writeFile(filePath, Buffer.from("not a PDF"));
      const res = makeResponse();
      await uploadResume(req, res);

      assert.equal(res.statusCode, 422);
      assert.equal(await fs.stat(filePath).then(() => true, () => false), false);
      assert.equal(operations.some((operation) => operation.type === "upload"), false);
    });

    await t.test("deleting a legacy local resume remains supported", async () => {
      const filename = `legacy-${crypto.randomUUID()}.pdf`;
      const filePath = path.join(resumeDirectory, filename);
      await fs.writeFile(filePath, Buffer.from("legacy"));
      await Resume.create({
        studentId,
        originalName: filename,
        filename,
        path: filePath,
        mimeType: "application/pdf",
        size: 6,
        extractedText: "Legacy resume",
      });
      operations.length = 0;
      const res = makeResponse();
      await deleteMyResume({ user: { _id: studentId } }, res);

      assert.equal(res.statusCode, 200);
      assert.equal(await fs.stat(filePath).then(() => true, () => false), false);
      assert.equal(operations.length, 0);
    });
  } finally {
    cloudinary.uploader.upload = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

after(async () => {
  cloudinary.uploader.upload = originalUpload;
  cloudinary.uploader.destroy = originalDestroy;
  if (mongoose.connection.readyState === 1) {
    if (dbName && mongoose.connection.name === dbName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
