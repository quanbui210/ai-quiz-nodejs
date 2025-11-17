"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeEmbeddings = storeEmbeddings;
exports.findSimilarChunks = findSimilarChunks;
exports.findSimilarChunksAcrossDocuments = findSimilarChunksAcrossDocuments;
exports.deleteDocumentEmbeddings = deleteDocumentEmbeddings;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function storeEmbeddings(documentId, chunks) {
    try {
        for (const chunk of chunks) {
            await prisma.$executeRaw `
        INSERT INTO "DocumentEmbedding" (
          id,
          "documentId",
          "chunkIndex",
          "chunkText",
          embedding,
          metadata,
          "createdAt"
        )
        VALUES (
          gen_random_uuid()::text,
          ${documentId}::uuid,
          ${chunk.index},
          ${chunk.text},
          ${JSON.stringify(chunk.embedding)}::vector,
          ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
          NOW()
        )
      `;
        }
        await prisma.document.update({
            where: { id: documentId },
            data: { chunkCount: chunks.length },
        });
    }
    catch (error) {
        throw new Error(`Failed to store embeddings: ${error.message}`);
    }
}
async function findSimilarChunks(documentId, queryEmbedding, limit = 5, similarityThreshold = 0.7) {
    try {
        const embeddingVector = JSON.stringify(queryEmbedding);
        const results = await prisma.$queryRaw `
      SELECT
        id,
        "chunkIndex",
        "chunkText",
        1 - (embedding <=> ${embeddingVector}::vector) as similarity,
        metadata
      FROM "DocumentEmbedding"
      WHERE "documentId"::text = ${documentId}
        AND 1 - (embedding <=> ${embeddingVector}::vector) >= ${similarityThreshold}
      ORDER BY embedding <=> ${embeddingVector}::vector
      LIMIT ${limit}
    `;
        return results;
    }
    catch (error) {
        throw new Error(`Failed to find similar chunks: ${error.message}`);
    }
}
async function findSimilarChunksAcrossDocuments(documentIds, queryEmbedding, limit = 5, similarityThreshold = 0.7) {
    try {
        const results = await prisma.$queryRaw `
      SELECT
        id,
        "documentId",
        "chunkIndex",
        "chunkText",
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity,
        metadata
      FROM "DocumentEmbedding"
      WHERE "documentId" = ANY(${documentIds}::uuid[])
        AND 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${similarityThreshold}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `;
        return results;
    }
    catch (error) {
        throw new Error(`Failed to find similar chunks across documents: ${error.message}`);
    }
}
async function deleteDocumentEmbeddings(documentId) {
    try {
        await prisma.documentEmbedding.deleteMany({
            where: { documentId },
        });
    }
    catch (error) {
        throw new Error(`Failed to delete embeddings: ${error.message}`);
    }
}
//# sourceMappingURL=pgvector.js.map