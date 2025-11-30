import { Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import { processDocument } from "../../utils/document-processor";
import {
  uploadFileToStorage,
  deleteFileFromStorage,
  getSignedUrl,
  getFileUrl,
} from "../../utils/storage";
import { analyzeResume } from "./resume.service";
import { Prisma } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import os from "os";

const TEMP_DIR = path.join(os.tmpdir(), "resume-processing");
fs.mkdir(TEMP_DIR, { recursive: true }).catch(console.error);

export const uploadResume = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let storagePath: string;
    try {
      storagePath = await uploadFileToStorage(
        file.path,
        file.originalname,
        req.user.id,
      );
    } catch (error: any) {
      await fs.unlink(file.path).catch(console.error);
      console.error("Failed to upload to Supabase Storage:", error);
      return res.status(500).json({
        error: "Failed to upload file to storage",
        message: error.message,
      });
    }

    await fs.unlink(file.path).catch(console.error);

    const document = await prisma.document.create({
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

    const resume = await prisma.resume.create({
      data: {
        userId: req.user.id,
        documentId: document.id,
        filename: file.originalname,
        filePath: storagePath,
        mimeType: file.mimetype,
        status: "PROCESSING",
      },
    });

    const { incrementResumeCount } = await import("../../utils/usage");
    await incrementResumeCount(req.user.id);

    processResumeAsync(resume.id, document.id, storagePath, file.mimetype).catch(
      (error) => {
        console.error(`Failed to process resume ${resume.id}:`, error);
        prisma.resume
          .update({
            where: { id: resume.id },
            data: { status: "FAILED" },
          })
          .catch(console.error);
      },
    );

    return res.status(201).json({
      message: "Resume uploaded successfully",
      resume: {
        id: resume.id,
        filename: resume.filename,
        status: resume.status,
        createdAt: resume.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Upload resume error:", error);
    return res.status(500).json({ error: "Failed to upload resume" });
  }
};

async function processResumeAsync(
  resumeId: string,
  documentId: string,
  storagePath: string,
  mimeType: string,
) {
  try {
    await prisma.resume.update({
      where: { id: resumeId },
      data: { status: "PROCESSING" },
    });

    const tempPath = path.join(TEMP_DIR, `resume-${resumeId}-${Date.now()}`);
    await fs.mkdir(path.dirname(tempPath), { recursive: true });

    const { downloadFileFromStorage } = await import("../../utils/storage");
    await downloadFileFromStorage(storagePath, tempPath);

    const extractedText = await processDocument(tempPath, mimeType);

    await fs.unlink(tempPath).catch(console.error);

    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        parsedText: extractedText.text || null,
        status: extractedText.text ? "PROCESSING" : "READY",
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: "READY" },
    });

    if (extractedText.text) {
      console.log(`[Resume Processing] Starting analysis for ${resumeId}...`);
      try {
        await analyzeResumeAsync(resumeId, extractedText.text);
        await prisma.resume.update({
          where: { id: resumeId },
          data: { status: "READY" },
        });
        console.log(`[Resume Processing]  Resume ${resumeId} complete - text extracted and analyzed`);
      } catch (error: any) {
        console.error(`[Resume Processing]  Analysis failed for ${resumeId}:`, error);
        await prisma.resume.update({
          where: { id: resumeId },
          data: { status: "READY" },
        });
      }
    } else {
      console.warn(`[Resume Processing] No text extracted from resume ${resumeId}, skipping analysis`);
    }
  } catch (error: any) {
    console.error(`Resume processing error for ${resumeId}:`, error);
    await prisma.resume.update({
      where: { id: resumeId },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

async function analyzeResumeAsync(resumeId: string, resumeText: string) {
  try {
    
    const resume = await prisma.resume.findUnique({
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

    const analysis = await analyzeResume({
      resumeText,
    });

    console.log(`[Resume Analysis] AI returned score: ${analysis.score}`);

    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        analysisScore: analysis.score,
        analysisStrengths: analysis.strengths,
        analysisWeaknesses: analysis.weaknesses,
        analysisSuggestions: {
          ...analysis.suggestions,
          sectionRecommendations: analysis.sectionRecommendations || [],
        } as unknown as Prisma.InputJsonValue,
        analyzedAt: new Date(),
      },
    });

    console.log(`[Resume Analysis] Resume ${resumeId} analyzed successfully. Score: ${analysis.score}`);

    try {
      console.log(`[Resume Analysis] Generating CV embedding for job matching...`);
      const { generateEmbedding } = await import("../../utils/embeddings");
      const embedding = await generateEmbedding(resumeText.substring(0, 8000));
      
      await prisma.$executeRaw`
        UPDATE "Resume"
        SET "cvEmbedding" = ${JSON.stringify(embedding)}::vector
        WHERE id = ${resumeId}
      `;
      
    } catch (embeddingError: any) {
      console.error(`[Resume Analysis]  Failed to generate CV embedding:`, embeddingError.message);
    }
  } catch (error: any) {
    console.error(`[Resume Analysis] Error details:`, error.message, error.stack);

  }
}

export const listResumes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const resumes = await prisma.resume.findMany({
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
  } catch (error: any) {
    console.error("List resumes error:", error);
    return res.status(500).json({ error: "Failed to fetch resumes" });
  }
};

export const getResume = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { resumeId } = req.params;

    const resume = await prisma.resume.findFirst({
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
  } catch (error: any) {
    console.error("Get resume error:", error);
    return res.status(500).json({ error: "Failed to fetch resume" });
  }
};

export const deleteResume = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { resumeId } = req.params;

    const resume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        userId: req.user.id,
      },
    });

    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    if (resume.documentId) {
      const document = await prisma.document.findUnique({
        where: { id: resume.documentId },
      });

      if (document) {
        await deleteFileFromStorage(document.filePath).catch(console.error);
        await prisma.document.delete({ where: { id: document.id } });
      }
    } else {
      await deleteFileFromStorage(resume.filePath).catch(console.error);
    }

    await prisma.resume.delete({
      where: { id: resume.id },
    });

    const { decrementResumeCount } = await import("../../utils/usage");
    await decrementResumeCount(req.user.id);

    return res.json({ message: "Resume deleted successfully" });
  } catch (error: any) {
    console.error("Delete resume error:", error);
    return res.status(500).json({ error: "Failed to delete resume" });
  }
};

export const getResumePreview = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { resumeId } = req.params;

    const resume = await prisma.resume.findFirst({
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

    const signedUrl = await getSignedUrl(resume.filePath, 3600);

    return res.json({
      previewUrl: signedUrl,
      publicUrl: getFileUrl(resume.filePath),
      filename: resume.filename,
      mimeType: resume.mimeType,
      expiresIn: 3600,
    });
  } catch (error: any) {
    console.error("Get resume preview error:", error);
    return res.status(500).json({ error: "Failed to get resume preview" });
  }
};

export const analyzeResumeManually = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { resumeId } = req.params;

    const resume = await prisma.resume.findFirst({
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

    const updatedResume = await prisma.resume.findUnique({
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
  } catch (error: any) {
    console.error("Manual resume analysis error:", error);
    return res.status(500).json({ error: "Failed to analyze resume" });
  }
};

