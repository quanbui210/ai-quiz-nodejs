import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import { processDocument } from "../../utils/document-processor";
import { generateEmbeddingsBatch } from "../../utils/embeddings";
import { storeEmbeddings, deleteDocumentEmbeddings } from "../../utils/pgvector";
import { incrementDocumentCount, decrementDocumentCount } from "../../utils/usage";
import {
  uploadFileToStorage,
  downloadFileFromStorage,
  deleteFileFromStorage,
} from "../../utils/storage";
import path from "path";
import fs from "fs/promises";
import os from "os";

const TEMP_DIR = path.join(os.tmpdir(), "document-processing");
fs.mkdir(TEMP_DIR, { recursive: true }).catch(console.error);


export const uploadDocument = async (
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

    const { getUserUsage } = await import("../../utils/usage");
    const usage = await getUserUsage(req.user.id);
    const subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });

    const maxDocuments =
      subscription?.maxDocuments || subscription?.plan?.maxDocuments || 0;

    if (usage.documentsCount >= maxDocuments) {
      await fs.unlink(file.path).catch(console.error);
      return res.status(403).json({
        error: "Document limit reached",
        limit: maxDocuments,
        current: usage.documentsCount,
      });
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

    // Process document asynchronously
    processDocumentAsync(document.id, storagePath, file.mimetype).catch(
      (error) => {
        console.error(`Failed to process document ${document.id}:`, error);
        prisma.document
          .update({
            where: { id: document.id },
            data: { status: "FAILED" },
          })
          .catch(console.error);
      },
    );

    // Increment usage count
    await incrementDocumentCount(req.user.id);

    return res.status(201).json({
      message: "Document uploaded successfully",
      document: {
        id: document.id,
        filename: document.filename,
        status: document.status,
        createdAt: document.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Upload document error:", error);
    return res.status(500).json({ error: "Failed to upload document" });
  }
};

/**
 * Process document asynchronously: extract text, chunk, generate embeddings, store
 */
async function processDocumentAsync(
  documentId: string,
  storagePath: string,
  mimeType: string,
) {
  // Temporary local file path for processing
  const tempFilePath = path.join(
    TEMP_DIR,
    `${documentId}-${Date.now()}${path.extname(storagePath)}`,
  );

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING" },
    });

    await downloadFileFromStorage(storagePath, tempFilePath);

    const processed = await processDocument(tempFilePath, mimeType, {
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    if (processed.chunks.length === 0) {
      throw new Error("No text extracted from document");
    }

    const texts = processed.chunks.map((chunk) => chunk.text);
    const embeddings = await generateEmbeddingsBatch(texts, 100);

    const embeddingData = processed.chunks
      .map((chunk, index) => ({
        index: chunk.index,
        text: chunk.text,
        embedding: embeddings[index],
        metadata: chunk.metadata,
      }))
      .filter(
        (item): item is {
          index: number;
          text: string;
          embedding: number[];
          metadata: any;
        } => item.embedding !== undefined && item.embedding.length > 0,
      );

    await storeEmbeddings(documentId, embeddingData);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "READY",
        vectorized: true,
        chunkCount: processed.chunks.length,
      },
    });

    console.log(
      `Document ${documentId} processed successfully: ${processed.chunks.length} chunks`,
    );
  } catch (error: any) {
    console.error(`Error processing document ${documentId}:`, error);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "FAILED" },
    });
    throw error;
  } finally {
    // Clean up temporary file
    await fs.unlink(tempFilePath).catch(console.error);
  }
}

/**
 * List user's documents
 * GET /api/v1/documents
 */
export const listDocuments = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const documents = await prisma.document.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        fileSize: true,
        mimeType: true,
        status: true,
        vectorized: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ documents });
  } catch (error: any) {
    console.error("List documents error:", error);
    return res.status(500).json({ error: "Failed to fetch documents" });
  }
};

/**
 * Get document details
 * GET /api/v1/documents/:id
 */
export const getDocument = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Get counts separately
    const [embeddingsCount, chatSessionsCount] = await Promise.all([
      prisma.documentEmbedding.count({ where: { documentId: id } }),
      prisma.chatSession.count({ where: { documentId: id } }),
    ]);

    const documentWithCounts = {
      ...document,
      _count: {
        embeddings: embeddingsCount,
        chatSessions: chatSessionsCount,
      },
    };

    return res.json({ document: documentWithCounts });
  } catch (error: any) {
    console.error("Get document error:", error);
    return res.status(500).json({ error: "Failed to fetch document" });
  }
};

/**
 * Delete document
 * DELETE /api/v1/documents/:id
 */
export const deleteDocument = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Delete file from Supabase Storage
    if (document.filePath) {
      try {
        await deleteFileFromStorage(document.filePath);
      } catch (error: any) {
        console.error(
          `Failed to delete file from storage ${document.filePath}:`,
          error,
        );
        // Continue with deletion even if storage delete fails
      }
    }

    // Delete embeddings
    if (id) {
      await deleteDocumentEmbeddings(id);
    }

    // Delete document (cascades to embeddings and chat sessions)
    await prisma.document.delete({
      where: { id },
    });

    // Decrement usage count
    await decrementDocumentCount(req.user.id);

    return res.json({ message: "Document deleted successfully" });
  } catch (error: any) {
    console.error("Delete document error:", error);
    return res.status(500).json({ error: "Failed to delete document" });
  }
};

