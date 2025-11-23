"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromFile = extractTextFromFile;
exports.chunkText = chunkText;
exports.processDocument = processDocument;
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
const unzipper_1 = __importDefault(require("unzipper"));
const fast_xml_parser_1 = require("fast-xml-parser");
async function extractTextFromFile(filePath, mimeType) {
    try {
        switch (mimeType) {
            case "application/pdf": {
                const pdfBuffer = await promises_1.default.readFile(filePath);
                return await extractTextFromPDF(pdfBuffer);
            }
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            case "application/msword": {
                const wordBuffer = await promises_1.default.readFile(filePath);
                return await extractTextFromWord(wordBuffer);
            }
            case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            case "application/vnd.ms-powerpoint":
                return await extractTextFromPowerPoint(filePath);
            case "text/plain":
            case "text/markdown": {
                const textBuffer = await promises_1.default.readFile(filePath);
                return textBuffer.toString("utf-8");
            }
            default:
                try {
                    const defaultBuffer = await promises_1.default.readFile(filePath);
                    return defaultBuffer.toString("utf-8");
                }
                catch {
                    throw new Error(`Unsupported file type: ${mimeType}`);
                }
        }
    }
    catch (error) {
        throw new Error(`Failed to extract text: ${error.message}`);
    }
}
async function extractTextFromPDF(buffer) {
    try {
        const data = await (0, pdf_parse_1.default)(buffer);
        return data.text;
    }
    catch (error) {
        throw new Error(`Failed to parse PDF: ${error.message}`);
    }
}
async function extractTextFromWord(buffer) {
    try {
        const result = await mammoth_1.default.extractRawText({ buffer });
        return result.value;
    }
    catch (error) {
        throw new Error(`Failed to parse Word document: ${error.message}`);
    }
}
async function extractTextFromPowerPoint(filePath) {
    try {
        const ext = path_1.default.extname(filePath).toLowerCase();
        if (ext === ".pptx") {
            return await extractTextFromPPTX(filePath);
        }
        if (ext === ".ppt") {
            throw new Error("Legacy .ppt format is not supported. Please convert to .pptx format or use a newer PowerPoint file.");
        }
        throw new Error(`Unsupported PowerPoint format: ${ext}`);
    }
    catch (error) {
        throw new Error(`Failed to parse PowerPoint: ${error.message}`);
    }
}
async function extractTextFromPPTX(filePath) {
    const tempDir = path_1.default.join(path_1.default.dirname(filePath), `temp-${Date.now()}`);
    const parser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        textNodeName: "_text",
        attributeNamePrefix: "@_",
    });
    try {
        await promises_1.default.mkdir(tempDir, { recursive: true });
        await new Promise((resolve, reject) => {
            fs_1.default.createReadStream(filePath)
                .pipe(unzipper_1.default.Extract({ path: tempDir }))
                .on("close", resolve)
                .on("error", reject);
        });
        const slidesDir = path_1.default.join(tempDir, "ppt", "slides");
        let allText = [];
        try {
            const slideFiles = await promises_1.default.readdir(slidesDir);
            const xmlFiles = slideFiles
                .filter((file) => file.startsWith("slide") && file.endsWith(".xml"))
                .sort((a, b) => {
                const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || "0");
                const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || "0");
                return numA - numB;
            });
            for (const slideFile of xmlFiles) {
                const slidePath = path_1.default.join(slidesDir, slideFile);
                const slideContent = await promises_1.default.readFile(slidePath, "utf-8");
                const textMatches = slideContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
                if (textMatches) {
                    textMatches.forEach((match) => {
                        const text = match.replace(/<[^>]+>/g, "").trim();
                        if (text) {
                            allText.push(text);
                        }
                    });
                }
            }
        }
        catch (dirError) {
            console.warn("Could not read slides directory, trying alternative extraction:", dirError.message);
            const searchForTextInDir = async (dir) => {
                const texts = [];
                try {
                    const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path_1.default.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            texts.push(...(await searchForTextInDir(fullPath)));
                        }
                        else if (entry.name.endsWith(".xml")) {
                            try {
                                const content = await promises_1.default.readFile(fullPath, "utf-8");
                                const parsed = parser.parse(content);
                                const textMatch = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
                                if (textMatch) {
                                    textMatch.forEach((match) => {
                                        const text = match.replace(/<[^>]+>/g, "").trim();
                                        if (text)
                                            texts.push(text);
                                    });
                                }
                            }
                            catch (fileError) {
                                continue;
                            }
                        }
                    }
                }
                catch (error) {
                }
                return texts;
            };
            allText = await searchForTextInDir(tempDir);
        }
        await promises_1.default.rm(tempDir, { recursive: true, force: true }).catch(console.error);
        if (allText.length === 0) {
            throw new Error("No text content found in PowerPoint file");
        }
        return allText.join("\n");
    }
    catch (error) {
        await promises_1.default.rm(tempDir, { recursive: true, force: true }).catch(console.error);
        throw error;
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
        if (currentChunk.length + sentence.length > chunkSize &&
            currentChunk.length > 0) {
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
        }
        else {
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
    const chunks = chunkText(text, options?.chunkSize || 1000, options?.chunkOverlap || 200);
    return {
        text,
        chunks,
    };
}
//# sourceMappingURL=document-processor.js.map