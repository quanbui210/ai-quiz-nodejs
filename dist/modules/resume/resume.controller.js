"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResumeManually = exports.getResumePreview = exports.deleteResume = exports.getResume = exports.listResumes = exports.uploadResume = void 0;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const document_processor_1 = require("../../utils/document-processor");
const storage_1 = require("../../utils/storage");
const resume_service_1 = require("./resume.service");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const TEMP_DIR = path_1.default.join(os_1.default.tmpdir(), "resume-processing");
promises_1.default.mkdir(TEMP_DIR, { recursive: true }).catch(console.error);
const uploadResume = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        let storagePath;
        try {
            storagePath = await (0, storage_1.uploadFileToStorage)(file.path, file.originalname, req.user.id);
        }
        catch (error) {
            await promises_1.default.unlink(file.path).catch(console.error);
            console.error("Failed to upload to Supabase Storage:", error);
            return res.status(500).json({
                error: "Failed to upload file to storage",
                message: error.message,
            });
        }
        await promises_1.default.unlink(file.path).catch(console.error);
        const document = await prisma_1.default.document.create({
            data: {
                userId: req.user.id,
                filename: file.originalname,
                filePath: storagePath,
                fileSize: file.size,
                mimeType: file.mimetype,
                status: "UPLOADING",
                vectorized: false,
                chunkCount: 0,
            },
        });
        const resume = await prisma_1.default.resume.create({
            data: {
                userId: req.user.id,
                documentId: document.id,
                filename: file.originalname,
                filePath: storagePath,
                mimeType: file.mimetype,
                status: "PROCESSING",
            },
        });
        processResumeAsync(resume.id, document.id, storagePath, file.mimetype).catch((error) => {
            console.error(`Failed to process resume ${resume.id}:`, error);
            prisma_1.default.resume
                .update({
                where: { id: resume.id },
                data: { status: "FAILED" },
            })
                .catch(console.error);
        });
        return res.status(201).json({
            message: "Resume uploaded successfully",
            resume: {
                id: resume.id,
                filename: resume.filename,
                status: resume.status,
                createdAt: resume.createdAt,
            },
        });
    }
    catch (error) {
        console.error("Upload resume error:", error);
        return res.status(500).json({ error: "Failed to upload resume" });
    }
};
exports.uploadResume = uploadResume;
async function processResumeAsync(resumeId, documentId, storagePath, mimeType) {
    try {
        await prisma_1.default.resume.update({
            where: { id: resumeId },
            data: { status: "PROCESSING" },
        });
        const tempPath = path_1.default.join(TEMP_DIR, `resume-${resumeId}-${Date.now()}`);
        await promises_1.default.mkdir(path_1.default.dirname(tempPath), { recursive: true });
        const { downloadFileFromStorage } = await Promise.resolve().then(() => __importStar(require("../../utils/storage")));
        await downloadFileFromStorage(storagePath, tempPath);
        const extractedText = await (0, document_processor_1.processDocument)(tempPath, mimeType);
        await promises_1.default.unlink(tempPath).catch(console.error);
        await prisma_1.default.resume.update({
            where: { id: resumeId },
            data: {
                parsedText: extractedText.text || null,
                status: extractedText.text ? "PROCESSING" : "READY",
            },
        });
        await prisma_1.default.document.update({
            where: { id: documentId },
            data: { status: "READY" },
        });
        if (extractedText.text) {
            console.log(`[Resume Processing] Starting analysis for ${resumeId}...`);
            try {
                await analyzeResumeAsync(resumeId, extractedText.text);
                await prisma_1.default.resume.update({
                    where: { id: resumeId },
                    data: { status: "READY" },
                });
                console.log(`[Resume Processing] ✅ Resume ${resumeId} complete - text extracted and analyzed`);
            }
            catch (error) {
                console.error(`[Resume Processing] ❌ Analysis failed for ${resumeId}:`, error);
                await prisma_1.default.resume.update({
                    where: { id: resumeId },
                    data: { status: "READY" },
                });
            }
        }
        else {
            console.warn(`[Resume Processing] No text extracted from resume ${resumeId}, skipping analysis`);
        }
    }
    catch (error) {
        console.error(`Resume processing error for ${resumeId}:`, error);
        await prisma_1.default.resume.update({
            where: { id: resumeId },
            data: { status: "FAILED" },
        });
        throw error;
    }
}
async function analyzeResumeAsync(resumeId, resumeText) {
    try {
        console.log(`[Resume Analysis] Starting for resume ${resumeId}...`);
        const resume = await prisma_1.default.resume.findUnique({
            where: { id: resumeId },
            select: { id: true },
        });
        if (!resume) {
            throw new Error("Resume not found");
        }
        if (!resumeText || resumeText.trim().length === 0) {
            console.warn(`[Resume Analysis] No text available for resume ${resumeId}`);
            return;
        }
        console.log(`[Resume Analysis] Calling AI service with ${resumeText.length} characters...`);
        const analysis = await (0, resume_service_1.analyzeResume)({
            resumeText,
        });
        console.log(`[Resume Analysis] AI returned score: ${analysis.score}`);
        await prisma_1.default.resume.update({
            where: { id: resumeId },
            data: {
                analysisScore: analysis.score,
                analysisStrengths: analysis.strengths,
                analysisWeaknesses: analysis.weaknesses,
                analysisSuggestions: analysis.suggestions,
                analyzedAt: new Date(),
            },
        });
        console.log(`[Resume Analysis] ✅ Resume ${resumeId} analyzed successfully. Score: ${analysis.score}`);
    }
    catch (error) {
        console.error(`[Resume Analysis] ❌ Error analyzing resume ${resumeId}:`, error);
        console.error(`[Resume Analysis] Error details:`, error.message, error.stack);
    }
}
const listResumes = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const resumes = await prisma_1.default.resume.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                filename: true,
                status: true,
                analysisScore: true,
                analyzedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return res.json({ resumes });
    }
    catch (error) {
        console.error("List resumes error:", error);
        return res.status(500).json({ error: "Failed to fetch resumes" });
    }
};
exports.listResumes = listResumes;
const getResume = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { resumeId } = req.params;
        const resume = await prisma_1.default.resume.findFirst({
            where: {
                id: resumeId,
                userId: req.user.id,
            },
            select: {
                id: true,
                userId: true,
                documentId: true,
                title: true,
                filename: true,
                filePath: true,
                mimeType: true,
                status: true,
                parsedText: true,
                createdAt: true,
                updatedAt: true,
                analysisScore: true,
                analysisStrengths: true,
                analysisWeaknesses: true,
                analysisSuggestions: true,
                analyzedAt: true,
                interviewSessions: {
                    select: {
                        id: true,
                        role: true,
                        level: true,
                        overallScore: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                },
            },
        });
        if (!resume) {
            return res.status(404).json({ error: "Resume not found" });
        }
        return res.json({ resume });
    }
    catch (error) {
        console.error("Get resume error:", error);
        return res.status(500).json({ error: "Failed to fetch resume" });
    }
};
exports.getResume = getResume;
const deleteResume = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { resumeId } = req.params;
        const resume = await prisma_1.default.resume.findFirst({
            where: {
                id: resumeId,
                userId: req.user.id,
            },
        });
        if (!resume) {
            return res.status(404).json({ error: "Resume not found" });
        }
        if (resume.documentId) {
            const document = await prisma_1.default.document.findUnique({
                where: { id: resume.documentId },
            });
            if (document) {
                await (0, storage_1.deleteFileFromStorage)(document.filePath).catch(console.error);
                await prisma_1.default.document.delete({ where: { id: document.id } });
            }
        }
        else {
            await (0, storage_1.deleteFileFromStorage)(resume.filePath).catch(console.error);
        }
        await prisma_1.default.resume.delete({
            where: { id: resume.id },
        });
        return res.json({ message: "Resume deleted successfully" });
    }
    catch (error) {
        console.error("Delete resume error:", error);
        return res.status(500).json({ error: "Failed to delete resume" });
    }
};
exports.deleteResume = deleteResume;
const getResumePreview = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { resumeId } = req.params;
        const resume = await prisma_1.default.resume.findFirst({
            where: {
                id: resumeId,
                userId: req.user.id,
            },
            select: {
                id: true,
                filePath: true,
                mimeType: true,
                filename: true,
                status: true,
            },
        });
        if (!resume) {
            return res.status(404).json({ error: "Resume not found" });
        }
        if (resume.status !== "READY") {
            return res.status(400).json({
                error: "Resume is not ready for preview",
                status: resume.status,
            });
        }
        const signedUrl = await (0, storage_1.getSignedUrl)(resume.filePath, 3600);
        return res.json({
            previewUrl: signedUrl,
            publicUrl: (0, storage_1.getFileUrl)(resume.filePath),
            filename: resume.filename,
            mimeType: resume.mimeType,
            expiresIn: 3600,
        });
    }
    catch (error) {
        console.error("Get resume preview error:", error);
        return res.status(500).json({ error: "Failed to get resume preview" });
    }
};
exports.getResumePreview = getResumePreview;
const analyzeResumeManually = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { resumeId } = req.params;
        const resume = await prisma_1.default.resume.findFirst({
            where: {
                id: resumeId,
                userId: req.user.id,
            },
            select: {
                id: true,
                parsedText: true,
                status: true,
            },
        });
        if (!resume) {
            return res.status(404).json({ error: "Resume not found" });
        }
        if (resume.status !== "READY") {
            return res.status(400).json({
                error: "Resume must be processed and ready before analysis",
            });
        }
        if (!resume.parsedText) {
            return res.status(400).json({
                error: "Resume text not available for analysis",
            });
        }
        await analyzeResumeAsync(resume.id, resume.parsedText);
        const updatedResume = await prisma_1.default.resume.findUnique({
            where: { id: resume.id },
            select: {
                id: true,
                analysisScore: true,
                analysisStrengths: true,
                analysisWeaknesses: true,
                analysisSuggestions: true,
                analyzedAt: true,
            },
        });
        return res.json({
            message: "Resume analyzed successfully",
            analysis: {
                score: updatedResume?.analysisScore,
                strengths: updatedResume?.analysisStrengths,
                weaknesses: updatedResume?.analysisWeaknesses,
                suggestions: updatedResume?.analysisSuggestions,
                analyzedAt: updatedResume?.analyzedAt,
            },
        });
    }
    catch (error) {
        console.error("Manual resume analysis error:", error);
        return res.status(500).json({ error: "Failed to analyze resume" });
    }
};
exports.analyzeResumeManually = analyzeResumeManually;
//# sourceMappingURL=resume.controller.js.map