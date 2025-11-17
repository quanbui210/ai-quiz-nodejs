import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import OpenAI from "openai";
import { generateEmbedding } from "../../utils/embeddings";
import { findSimilarChunks } from "../../utils/pgvector";
import { incrementQuizCount } from "../../utils/usage";
import { Difficulty, QuizType, QuizStatus } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const getDocumentQuizzes = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: req.user.id,
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    const quizzes = await prisma.quiz.findMany({
      where: {
        documentId: documentId,
        userId: req.user.id,
      },
      select: {
        id: true,
        title: true,
        type: true,
        difficulty: true,
        count: true,
        status: true,
        timer: true,
        createdAt: true,
        topicId: true,
        topic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      documentId: documentId,
      quizzes: quizzes,
      count: quizzes.length,
    });
  } catch (error: any) {
    console.error("Get document quizzes error:", error);
    return res.status(500).json({ error: "Failed to fetch document quizzes" });
  }
};

export const generateQuizFromDocument = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId } = req.params;
    const {
      topicId,
      title,
      difficulty = "INTERMEDIATE",
      questionCount = 10,
      quizType = "MULTIPLE_CHOICE",
      timer,
      focus,
    } = req.body;

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: req.user.id,
        status: "READY",
        vectorized: true,
      },
    });

    if (!document) {
      return res.status(404).json({
        error: "Document not found, not ready, or not vectorized",
      });
    }

    if (topicId) {
      const topic = await prisma.topic.findFirst({
        where: {
          id: topicId,
          userId: req.user.id,
        },
      });

      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }
    }

    const subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });

    const allowedModels = subscription?.allowedModels ||
      subscription?.plan?.allowedModels || ["gpt-3.5-turbo"];

    const model = allowedModels[0] || "gpt-3.5-turbo";

    if (!model) {
      return res.status(400).json({ error: "No AI model available" });
    }

    let documentContext = "";
    let relevantChunks: any[] = [];

    try {
      const embeddingCount = await prisma.documentEmbedding.count({
        where: { documentId: document.id },
      });

      if (embeddingCount === 0) {
        return res.status(400).json({
          error:
            "Document has no embeddings. Please wait for document processing to complete.",
          documentStatus: document.status,
          vectorized: document.vectorized,
        });
      }

      const queryText = focus || "main concepts and key information";
      const queryEmbedding = await generateEmbedding(queryText);

      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Failed to generate query embedding");
      }

      console.log(
        `Searching for similar chunks in document ${documentId} (${embeddingCount} embeddings available)`,
      );

      let chunks: any[] = [];
      let similarityThreshold = 0.6;

      chunks = await findSimilarChunks(
        documentId as string,
        queryEmbedding,
        Math.min(questionCount * 2, 20),
        similarityThreshold,
      );

      console.log(
        `Found ${chunks.length} similar chunks with threshold ${similarityThreshold}`,
      );

      if (chunks.length === 0) {
        console.log(
          "No chunks found with threshold 0.6, trying lower threshold 0.3...",
        );
        similarityThreshold = 0.3;
        chunks = await findSimilarChunks(
          documentId as string,
          queryEmbedding,
          Math.min(questionCount * 2, 20),
          similarityThreshold,
        );
        console.log(
          `Found ${chunks.length} similar chunks with threshold ${similarityThreshold}`,
        );
      }

      if (chunks.length === 0) {
        console.log(
          "Still no chunks found, trying to get any chunks from document...",
        );
        const allChunks = await prisma.documentEmbedding.findMany({
          where: { documentId: document.id },
          orderBy: { chunkIndex: "asc" },
          take: Math.min(questionCount * 2, 20),
          select: {
            id: true,
            chunkIndex: true,
            chunkText: true,
            metadata: true,
          },
        });

        if (allChunks.length > 0) {
          chunks = allChunks.map((chunk) => ({
            id: chunk.id,
            chunkIndex: chunk.chunkIndex,
            chunkText: chunk.chunkText,
            similarity: 0.5,
            metadata: chunk.metadata,
          }));
          console.log(
            `Using ${chunks.length} chunks from document (no similarity match found)`,
          );
        }
      }

      if (chunks.length === 0) {
        return res.status(400).json({
          error: "Document has no content available for quiz generation.",
          documentStatus: document.status,
          embeddingCount: embeddingCount,
        });
      }

      relevantChunks = chunks;
      documentContext = chunks
        .map(
          (chunk, index) =>
            `[Section ${index + 1}]: ${chunk.chunkText.substring(0, 800)}`,
        )
        .join("\n\n");
    } catch (error: any) {
      console.error("Error retrieving document context:", error);
      console.error("Error details:", {
        documentId,
        documentStatus: document.status,
        vectorized: document.vectorized,
        errorMessage: error.message,
        errorStack: error.stack,
      });
      return res.status(500).json({
        error: "Failed to retrieve document content for quiz generation",
        message: error.message,
        details: "Check if document is fully processed and has embeddings.",
      });
    }

    if (documentContext.length === 0) {
      return res.status(400).json({
        error: "No relevant content found in document for quiz generation",
      });
    }

    const quizPrompt = `You are a quiz generation assistant. Create a ${difficulty.toLowerCase()} level quiz with ${questionCount} ${quizType.toLowerCase().replace("_", " ")} questions based on the following document content.

Document Content:
${documentContext}

Instructions:
- Generate questions that test understanding of the document content
- Questions should be clear, specific, and answerable from the provided content
- For multiple choice questions, provide exactly 4 options (A, B, C, D)
- Ensure correct answers are accurate based on the document
- Include explanations that reference the document content
- Make questions progressively more challenging if difficulty is ADVANCED
- Focus on key concepts, facts, and important information from the document${focus ? `\n- Pay special attention to: ${focus}` : ""}

CRITICAL FORMAT REQUIREMENTS - FOLLOW EXACTLY:

For each question, use this EXACT structure:

### Question [NUMBER]
[Question text here]

A) [First option text]
B) [Second option text]
C) [Third option text]
D) [Fourth option text]
✅ Correct answer: [LETTER]) [EXACT OPTION TEXT FROM ABOVE]

Explanation: [Explanation text here, referencing the document]

STRICT RULES:
1. Each question MUST start with "### Question [NUMBER]"
2. Question text MUST be on the line immediately after the header
3. You MUST have exactly 4 options: A), B), C), D)
4. Each option MUST be on its own line
5. The correct answer line MUST be: "✅ Correct answer: [LETTER]) [EXACT TEXT]"
6. The correct answer text MUST match EXACTLY one of the option texts above
7. The explanation MUST start with "Explanation: "
8. Leave a blank line between each question block
9. Do NOT add any title, header, or extra text before Question 1
10. Do NOT add any closing text after the last question`;

    const response = await openai.chat.completions.create({
      model: model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: quizPrompt,
        },
        {
          role: "user",
          content: `Generate a ${difficulty} level quiz with ${questionCount} questions from the document.${focus ? ` Focus on: ${focus}` : ""}`,
        },
      ],
      max_tokens: 4000,
    });

    const quizText = response.choices[0]?.message?.content;
    if (!quizText) {
      return res.status(400).json({ error: "No quiz generated" });
    }

    const parsedQuiz = parseQuizResponse(quizText);
    if (!parsedQuiz || parsedQuiz.questions.length === 0) {
      return res.status(400).json({
        error: "Failed to parse quiz. Please try again.",
      });
    }

    const quizTitle = title || `${document.filename} Quiz`;
    const createdQuiz = await prisma.quiz.create({
      data: {
        title: quizTitle,
        type: quizType as QuizType,
        difficulty: difficulty as Difficulty,
        count: parsedQuiz.questions.length,
        status: QuizStatus.ACTIVE,
        timer: timer || null,
        topicId: topicId || null,
        documentId: documentId,
        userId: req.user.id,
        questions: {
          create: parsedQuiz.questions.map((q) => ({
            text: q.text,
            type:
              quizType === "MULTIPLE_CHOICE"
                ? "MULTIPLE_CHOICE"
                : "SHORT_ANSWER",
            options: q.options ? JSON.stringify(q.options) : undefined,
            correct: q.correct,
            explanation: q.explanation
              ? {
                  create: {
                    content: q.explanation,
                  },
                }
              : undefined,
          })),
        },
      },
      include: {
        questions: {
          include: {
            explanation: true,
          },
        },
      },
    });

    await incrementQuizCount(req.user.id);

    return res.status(201).json({
      message: "Quiz generated successfully from document",
      quiz: {
        id: createdQuiz.id,
        title: createdQuiz.title,
        difficulty: createdQuiz.difficulty,
        count: createdQuiz.count,
        questions: createdQuiz.questions.map((q: any) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          options: q.options ? JSON.parse(q.options as string) : null,
          correct: q.correct,
          explanation: q.explanation?.content,
        })),
        documentId: documentId,
        relevantChunksUsed: relevantChunks.length,
      },
    });
  } catch (error: any) {
    console.error("Generate quiz from document error:", error);
    return res.status(500).json({
      error: "Failed to generate quiz from document",
      message: error.message,
    });
  }
};

interface ParsedQuestion {
  text: string;
  options: string[] | null;
  correct: string;
  explanation?: string;
}

interface ParsedQuiz {
  questions: ParsedQuestion[];
}

function parseQuizResponse(quizText: string): ParsedQuiz | null {
  try {
    const questions: ParsedQuestion[] = [];
    const questionBlocks = quizText.split(/### Question \d+/).filter(Boolean);

    for (const block of questionBlocks) {
      const lines = block
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      if (lines.length === 0) continue;

      const firstLine = lines[0];
      if (!firstLine) continue;

      let questionText = firstLine.trim();
      if (!questionText) continue;

      const options: string[] = [];
      let correctAnswer = "";
      let explanation = "";

      let i = 1;
      while (i < lines.length) {
        const currentLine = lines[i];
        if (!currentLine) {
          i++;
          continue;
        }

        const line = currentLine.trim();

        const optionMatch = line.match(/^([A-D])\)\s*(.+)$/);
        if (optionMatch && optionMatch[2]) {
          options.push(optionMatch[2].trim());
          i++;
          continue;
        }

        const correctMatch = line.match(
          /✅\s*Correct answer:\s*([A-D])\)\s*(.+)$/i,
        );
        if (correctMatch && correctMatch[1] && correctMatch[2]) {
          const letter = correctMatch[1];
          const answerText = correctMatch[2].trim();
          const optionIndex = letter.charCodeAt(0) - 65;
          if (
            optionIndex >= 0 &&
            optionIndex < options.length &&
            options[optionIndex]
          ) {
            correctAnswer = options[optionIndex];
          } else {
            correctAnswer = answerText;
          }
          i++;
          continue;
        }

        if (line.toLowerCase().startsWith("explanation:")) {
          explanation = line.substring("explanation:".length).trim();
          i++;
          while (i < lines.length) {
            const nextLine = lines[i];
            if (!nextLine || nextLine.match(/^[A-D]\)/)) {
              break;
            }
            explanation += " " + nextLine.trim();
            i++;
          }
          continue;
        }

        i++;
      }

      if (questionText && correctAnswer) {
        questions.push({
          text: questionText,
          options: options.length > 0 ? options : null,
          correct: correctAnswer,
          explanation: explanation || undefined,
        });
      }
    }

    return questions.length > 0 ? { questions } : null;
  } catch (error: any) {
    console.error("Parse quiz response error:", error);
    return null;
  }
}
