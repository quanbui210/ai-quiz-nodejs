import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Store embeddings in pgvector
 * Note: Prisma doesn't natively support vector types, so we use raw SQL
 */
export async function storeEmbeddings(
  documentId: string,
  chunks: Array<{
    index: number;
    text: string;
    embedding: number[];
    metadata?: any;
  }>,
) {
  try {
    for (const chunk of chunks) {
      await prisma.$executeRaw`
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
  } catch (error: any) {
    throw new Error(`Failed to store embeddings: ${error.message}`);
  }
}

export async function findSimilarChunks(
  documentId: string,
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.7,
): Promise<
  Array<{
    id: string;
    chunkIndex: number;
    chunkText: string;
    similarity: number;
    metadata: any;
  }>
> {
  try {
    const embeddingVector = JSON.stringify(queryEmbedding);
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        chunkIndex: number;
        chunkText: string;
        similarity: number;
        metadata: any;
      }>
    >`
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
  } catch (error: any) {
    throw new Error(`Failed to find similar chunks: ${error.message}`);
  }
}

export async function findSimilarChunksAcrossDocuments(
  documentIds: string[],
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.7,
): Promise<
  Array<{
    id: string;
    documentId: string;
    chunkIndex: number;
    chunkText: string;
    similarity: number;
    metadata: any;
  }>
> {
  try {
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        documentId: string;
        chunkIndex: number;
        chunkText: string;
        similarity: number;
        metadata: any;
      }>
    >`
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
  } catch (error: any) {
    throw new Error(
      `Failed to find similar chunks across documents: ${error.message}`,
    );
  }
}

/**
 * Delete all embeddings for a document
 */
export async function deleteDocumentEmbeddings(documentId: string) {
  try {
    await prisma.documentEmbedding.deleteMany({
      where: { documentId },
    });
  } catch (error: any) {
    throw new Error(`Failed to delete embeddings: ${error.message}`);
  }
}
