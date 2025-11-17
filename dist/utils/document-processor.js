"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromFile = extractTextFromFile;
exports.chunkText = chunkText;
exports.processDocument = processDocument;
const promises_1 = __importDefault(require("fs/promises"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
async function extractTextFromFile(filePath, mimeType) {
  try {
    const fileBuffer = await promises_1.default.readFile(filePath);
    switch (mimeType) {
      case "application/pdf":
        return await extractTextFromPDF(fileBuffer);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      case "application/msword":
        return await extractTextFromWord(fileBuffer);
      case "text/plain":
        return fileBuffer.toString("utf-8");
      case "text/markdown":
        return fileBuffer.toString("utf-8");
      default:
        try {
          return fileBuffer.toString("utf-8");
        } catch {
          throw new Error(`Unsupported file type: ${mimeType}`);
        }
    }
  } catch (error) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}
async function extractTextFromPDF(buffer) {
  try {
    const data = await (0, pdf_parse_1.default)(buffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}
async function extractTextFromWord(buffer) {
  try {
    const result = await mammoth_1.default.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error(`Failed to parse Word document: ${error.message}`);
  }
}
function chunkText(text, chunkSize = 1000, chunkOverlap = 200) {
  if (!text || text.trim().length === 0) {
    return [];
  }
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = "";
  let chunkIndex = 0;
  let startIndex = 0;
  for (const sentence of sentences) {
    if (
      currentChunk.length + sentence.length > chunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++,
        metadata: {
          startIndex,
          endIndex: startIndex + currentChunk.length,
        },
      });
      const overlapText = currentChunk.slice(-chunkOverlap);
      currentChunk = overlapText + " " + sentence;
      startIndex = startIndex + currentChunk.length - chunkOverlap;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: {
        startIndex,
        endIndex: startIndex + currentChunk.length,
      },
    });
  }
  return chunks;
}
async function processDocument(filePath, mimeType, options) {
  const text = await extractTextFromFile(filePath, mimeType);
  const chunks = chunkText(
    text,
    options?.chunkSize || 1000,
    options?.chunkOverlap || 200,
  );
  return {
    text,
    chunks,
  };
}
//# sourceMappingURL=document-processor.js.map
