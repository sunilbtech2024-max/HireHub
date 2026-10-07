const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");

const MAX_EXTRACTED_TEXT_LENGTH = 60000;
const readablePdfError = new Error(
  "Unable to extract readable text from this PDF."
);
readablePdfError.statusCode = 422;

const extractPdfText = async (filePath) => {
  let parser;
  try {
    const buffer = await fs.readFile(filePath);
    if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
      throw readablePdfError;
    }

    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = String(result.text || "").replace(/\u0000/g, "").trim();
    if (!text) throw readablePdfError;
    return text.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
  } catch (error) {
    if (error === readablePdfError) throw error;
    throw readablePdfError;
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // Ignore parser cleanup failures after extraction has completed.
      }
    }
  }
};

module.exports = { extractPdfText, MAX_EXTRACTED_TEXT_LENGTH };
