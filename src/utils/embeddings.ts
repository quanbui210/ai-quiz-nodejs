import OpenAI from "openai";

import { observeOpenAI } from "@langfuse/openai";
import { trace } from "@opentelemetry/api";

const openai = observeOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}));

const tracer = trace.getTracer("embeddings");

const EMBEDDING_MODEL = "text-embedding-3-small"; 



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

export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 100,
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

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

export function getEmbeddingDimensions(): number {
  return EMBEDDING_MODEL === "text-embedding-3-small" ? 1536 : 3072;
}
