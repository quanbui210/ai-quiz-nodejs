import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions, cheaper
// Alternative: "text-embedding-3-large" for 3072 dimensions (better quality, more expensive)

/**
 * Generate embedding for a single text chunk
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    return response.data[0]?.embedding || [];
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple text chunks in batch
 * OpenAI supports up to 2048 inputs per request
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 100,
): Promise<number[][]> {
  const embeddings: number[][] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

      // Sort embeddings by index to maintain order
      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      embeddings.push(...batchEmbeddings);
    } catch (error: any) {
      throw new Error(
        `Failed to generate embeddings for batch ${i / batchSize + 1}: ${error.message}`,
      );
    }
  }

  return embeddings;
}

/**
 * Get embedding model dimensions
 */
export function getEmbeddingDimensions(): number {
  return EMBEDDING_MODEL === "text-embedding-3-small" ? 1536 : 3072;
}
