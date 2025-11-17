import fs from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export interface DocumentChunk {
  text: string;
  index: number;
  metadata?: {
    page?: number;
    section?: string;
    startIndex?: number;
    endIndex?: number;
  };
}

export interface ProcessedDocument {
  text: string;
  chunks: DocumentChunk[];
}

/**
 * Extract text from various document formats
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);

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
        // Try to read as text for other text-based formats
        try {
          return fileBuffer.toString("utf-8");
        } catch {
          throw new Error(`Unsupported file type: ${mimeType}`);
        }
    }
  } catch (error: any) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

/**
 * Extract text from PDF file
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error: any) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}


async function extractTextFromWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error: any) {
    throw new Error(`Failed to parse Word document: ${error.message}`);
  }
}


export function chunkText(
  text: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200,
): DocumentChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = "";
  let chunkIndex = 0;
  let startIndex = 0;

  for (const sentence of sentences) {
    // If adding this sentence would exceed chunk size, save current chunk
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

      // Start new chunk with overlap (last part of previous chunk)
      const overlapText = currentChunk.slice(-chunkOverlap);
      currentChunk = overlapText + " " + sentence;
      startIndex = startIndex + currentChunk.length - chunkOverlap;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  // Add the last chunk if it exists
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

/**
 * Process a document: extract text and chunk it
 */
export async function processDocument(
  filePath: string,
  mimeType: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  },
): Promise<ProcessedDocument> {
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

