import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import unzipper from "unzipper";
import { XMLParser } from "fast-xml-parser";

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
    switch (mimeType) {
      case "application/pdf": {
        const pdfBuffer = await fs.readFile(filePath);
        return await extractTextFromPDF(pdfBuffer);
      }

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      case "application/msword": {
        const wordBuffer = await fs.readFile(filePath);
        return await extractTextFromWord(wordBuffer);
      }

      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      case "application/vnd.ms-powerpoint":
        return await extractTextFromPowerPoint(filePath);

      case "text/plain":
      case "text/markdown": {
        const textBuffer = await fs.readFile(filePath);
        return textBuffer.toString("utf-8");
      }

      default:
        // Try to read as text for other text-based formats
        try {
          const defaultBuffer = await fs.readFile(filePath);
          return defaultBuffer.toString("utf-8");
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

/**
 * Extract text from PowerPoint file (.pptx or .ppt)
 * .pptx files are ZIP archives containing XML files
 */
async function extractTextFromPowerPoint(filePath: string): Promise<string> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    // For .pptx (OpenXML format - ZIP archive)
    if (ext === ".pptx") {
      return await extractTextFromPPTX(filePath);
    }
    
    // For .ppt (legacy format - binary, harder to parse)
    // Note: .ppt files are binary and require special libraries
    // For now, we'll throw an error suggesting conversion to .pptx
    if (ext === ".ppt") {
      throw new Error(
        "Legacy .ppt format is not supported. Please convert to .pptx format or use a newer PowerPoint file."
      );
    }
    
    throw new Error(`Unsupported PowerPoint format: ${ext}`);
  } catch (error: any) {
    throw new Error(`Failed to parse PowerPoint: ${error.message}`);
  }
}

/**
 * Extract text from .pptx file (OpenXML format)
 * .pptx files are ZIP archives with XML files inside
 */
async function extractTextFromPPTX(filePath: string): Promise<string> {
  const tempDir = path.join(path.dirname(filePath), `temp-${Date.now()}`);
  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "_text",
    attributeNamePrefix: "@_",
  });

  try {
    await fs.mkdir(tempDir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      fsSync.createReadStream(filePath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on("close", resolve)
        .on("error", reject);
    });

    const slidesDir = path.join(tempDir, "ppt", "slides");
    let allText: string[] = [];

    try {
      const slideFiles = await fs.readdir(slidesDir);
      const xmlFiles = slideFiles
        .filter((file) => file.startsWith("slide") && file.endsWith(".xml"))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || "0");
          const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || "0");
          return numA - numB;
        });

      for (const slideFile of xmlFiles) {
        const slidePath = path.join(slidesDir, slideFile);
        const slideContent = await fs.readFile(slidePath, "utf-8");
        
        
        const textMatches = slideContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
        if (textMatches) {
          textMatches.forEach((match) => {
            // Extract text content between tags
            const text = match.replace(/<[^>]+>/g, "").trim();
            if (text) {
              allText.push(text);
            }
          });
        }
      }
    } catch (dirError: any) {
      console.warn("Could not read slides directory, trying alternative extraction:", dirError.message);
      
      const searchForTextInDir = async (dir: string): Promise<string[]> => {
        const texts: string[] = [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              texts.push(...(await searchForTextInDir(fullPath)));
            } else if (entry.name.endsWith(".xml")) {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                const parsed = parser.parse(content);
                
                const textMatch = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
                if (textMatch) {
                  textMatch.forEach((match) => {
                    const text = match.replace(/<[^>]+>/g, "").trim();
                    if (text) texts.push(text);
                  });
                }
              } catch (fileError) {
                continue;
              }
            }
          }
        } catch (error) {
        }
        return texts;
      };
      
      allText = await searchForTextInDir(tempDir);
    }

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);

    if (allText.length === 0) {
      throw new Error("No text content found in PowerPoint file");
    }

    // Join all text with newlines (each slide's text on separate lines)
    return allText.join("\n");
  } catch (error: any) {
    // Clean up temp directory on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
    throw error;
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
