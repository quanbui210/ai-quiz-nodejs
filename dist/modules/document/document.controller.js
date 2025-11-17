"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDocument =
  exports.getDocument =
  exports.listDocuments =
  exports.uploadDocument =
    void 0;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const document_processor_1 = require("../../utils/document-processor");
const embeddings_1 = require("../../utils/embeddings");
const pgvector_1 = require("../../utils/pgvector");
const usage_1 = require("../../utils/usage");
const storage_1 = require("../../utils/storage");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const TEMP_DIR = path_1.default.join(
  os_1.default.tmpdir(),
  "document-processing",
);
promises_1.default.mkdir(TEMP_DIR, { recursive: true }).catch(console.error);
const uploadDocument = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const { getUserUsage } = await Promise.resolve().then(() =>
      __importStar(require("../../utils/usage")),
    );
    const usage = await getUserUsage(req.user.id);
    const subscription = await prisma_1.default.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });
    const maxDocuments =
      subscription?.maxDocuments || subscription?.plan?.maxDocuments || 0;
    if (usage.documentsCount >= maxDocuments) {
      await promises_1.default.unlink(file.path).catch(console.error);
      return res.status(403).json({
        error: "Document limit reached",
        limit: maxDocuments,
        current: usage.documentsCount,
      });
    }
    let storagePath;
    try {
      storagePath = await (0, storage_1.uploadFileToStorage)(
        file.path,
        file.originalname,
        req.user.id,
      );
    } catch (error) {
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
    processDocumentAsync(document.id, storagePath, file.mimetype).catch(
      (error) => {
        console.error(`Failed to process document ${document.id}:`, error);
        prisma_1.default.document
          .update({
            where: { id: document.id },
            data: { status: "FAILED" },
          })
          .catch(console.error);
      },
    );
    await (0, usage_1.incrementDocumentCount)(req.user.id);
    return res.status(201).json({
      message: "Document uploaded successfully",
      document: {
        id: document.id,
        filename: document.filename,
        status: document.status,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error("Upload document error:", error);
    return res.status(500).json({ error: "Failed to upload document" });
  }
};
exports.uploadDocument = uploadDocument;
async function processDocumentAsync(documentId, storagePath, mimeType) {
  const tempFilePath = path_1.default.join(
    TEMP_DIR,
    `${documentId}-${Date.now()}${path_1.default.extname(storagePath)}`,
  );
  try {
    await prisma_1.default.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING" },
    });
    await (0, storage_1.downloadFileFromStorage)(storagePath, tempFilePath);
    const processed = await (0, document_processor_1.processDocument)(
      tempFilePath,
      mimeType,
      {
        chunkSize: 1000,
        chunkOverlap: 200,
      },
    );
    if (processed.chunks.length === 0) {
      throw new Error("No text extracted from document");
    }
    const texts = processed.chunks.map((chunk) => chunk.text);
    const embeddings = await (0, embeddings_1.generateEmbeddingsBatch)(
      texts,
      100,
    );
    const embeddingData = processed.chunks
      .map((chunk, index) => ({
        index: chunk.index,
        text: chunk.text,
        embedding: embeddings[index],
        metadata: chunk.metadata,
      }))
      .filter(
        (item) => item.embedding !== undefined && item.embedding.length > 0,
      );
    await (0, pgvector_1.storeEmbeddings)(documentId, embeddingData);
    await prisma_1.default.document.update({
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
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);
    await prisma_1.default.document.update({
      where: { id: documentId },
      data: { status: "FAILED" },
    });
    throw error;
  } finally {
    await promises_1.default.unlink(tempFilePath).catch(console.error);
  }
}
const listDocuments = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const documents = await prisma_1.default.document.findMany({
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
  } catch (error) {
    console.error("List documents error:", error);
    return res.status(500).json({ error: "Failed to fetch documents" });
  }
};
exports.listDocuments = listDocuments;
const getDocument = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { id } = req.params;
    const document = await prisma_1.default.document.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    const [embeddingsCount, chatSessionsCount] = await Promise.all([
      prisma_1.default.documentEmbedding.count({ where: { documentId: id } }),
      prisma_1.default.chatSession.count({ where: { documentId: id } }),
    ]);
    const documentWithCounts = {
      ...document,
      _count: {
        embeddings: embeddingsCount,
        chatSessions: chatSessionsCount,
      },
    };
    return res.json({ document: documentWithCounts });
  } catch (error) {
    console.error("Get document error:", error);
    return res.status(500).json({ error: "Failed to fetch document" });
  }
};
exports.getDocument = getDocument;
const deleteDocument = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { id } = req.params;
    const document = await prisma_1.default.document.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    if (document.filePath) {
      try {
        await (0, storage_1.deleteFileFromStorage)(document.filePath);
      } catch (error) {
        console.error(
          `Failed to delete file from storage ${document.filePath}:`,
          error,
        );
      }
    }
    if (id) {
      await (0, pgvector_1.deleteDocumentEmbeddings)(id);
    }
    await prisma_1.default.document.delete({
      where: { id },
    });
    await (0, usage_1.decrementDocumentCount)(req.user.id);
    return res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    return res.status(500).json({ error: "Failed to delete document" });
  }
};
exports.deleteDocument = deleteDocument;
//# sourceMappingURL=document.controller.js.map
