import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import OpenAI from "openai";
import { generateEmbedding } from "../../utils/embeddings";
import { findSimilarChunks } from "../../utils/pgvector";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const createChatSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId, title, model } = req.body;

    let document = null;
    if (documentId) {
      document = await prisma.document.findFirst({
        where: {
          id: documentId,
          userId: req.user.id,
          status: "READY",
        },
      });

      if (!document) {
        return res.status(404).json({
          error: "Document not found or not ready",
        });
      }
    }

    const subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });

    const allowedModels = subscription?.allowedModels ||
      subscription?.plan?.allowedModels || ["gpt-3.5-turbo"];

    const selectedModel = model || allowedModels[0];

    if (!allowedModels.includes(selectedModel)) {
      return res.status(403).json({
        error: "Model not allowed for your subscription",
        allowedModels,
      });
    }

    let session;
    let generatedTitle = title;

    // Auto-generate title from document if not provided
    if (!generatedTitle && document) {
      try {
        // Get first few chunks to generate a title
        const firstChunks = await prisma.documentEmbedding.findMany({
          where: { documentId: document.id },
          orderBy: { chunkIndex: "asc" },
          take: 3,
          select: { chunkText: true },
        });

        if (firstChunks.length > 0) {
          const sampleText = firstChunks
            .map((chunk) => chunk.chunkText.substring(0, 200))
            .join(" ");

          const titleCompletion = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              {
                role: "system",
                content:
                  "Generate a short, descriptive chat title (max 50 characters) based on the document content. Return only the title, no quotes or extra text.",
              },
              {
                role: "user",
                content: `Document: ${document.filename}\n\nContent sample:\n${sampleText}\n\nGenerate a chat title:`,
              },
            ],
            temperature: 0.7,
            max_tokens: 50,
          });

          generatedTitle =
            titleCompletion.choices[0]?.message?.content?.trim() || null;
        } else {
          // Fallback to filename-based title
          const filenameWithoutExt = document.filename.replace(/\.[^/.]+$/, "");
          generatedTitle = `Chat: ${filenameWithoutExt.substring(0, 40)}`;
        }
      } catch (error: any) {
        console.error("Error generating chat title:", error);
        // Fallback to filename-based title
        if (document) {
          const filenameWithoutExt = document.filename.replace(/\.[^/.]+$/, "");
          generatedTitle = `Chat: ${filenameWithoutExt.substring(0, 40)}`;
        }
      }
    }

    if (documentId) {
      const existingSession = await prisma.chatSession.findFirst({
        where: {
          userId: req.user.id,
          documentId: documentId,
          model: selectedModel,
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existingSession) {
        // Update title if it was auto-generated and session had no title
        if (generatedTitle && !existingSession.title) {
          session = await prisma.chatSession.update({
            where: { id: existingSession.id },
            data: { title: generatedTitle },
          });
        } else {
          session = existingSession;
        }
      } else {
        session = await prisma.chatSession.create({
          data: {
            userId: req.user.id,
            documentId: documentId,
            title: generatedTitle || null,
            model: selectedModel,
          },
        });
      }
    } else {
      session = await prisma.chatSession.create({
        data: {
          userId: req.user.id,
          documentId: null,
          title: generatedTitle || null,
          model: selectedModel,
        },
      });
    }

    return res.status(201).json({
      message: "Chat session created successfully",
      session: {
        id: session.id,
        documentId: session.documentId,
        title: session.title,
        model: session.model,
        createdAt: session.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Create chat session error:", error);
    return res.status(500).json({ error: "Failed to create chat session" });
  }
};

/**
 * Send a message in a chat session (with RAG if document attached)
 * POST /api/v1/chat/sessions/:sessionId/messages
 */
export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    const { message } = req.body;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get session and verify ownership
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
      include: {
        document: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50, // Last 50 messages for context
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    // Save user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content: message,
      },
    });

    // Prepare context for RAG if document is attached
    let contextChunks: any[] = [];
    let contextText = "";

    if (session.documentId && session.document?.status === "READY") {
      try {
        // Generate embedding for user's query
        const queryEmbedding = await generateEmbedding(message);

        // Try multiple similarity thresholds with more chunks
        let similarChunks: any[] = [];
        let similarityThreshold = 0.6; // Start with lower threshold

        // Try with threshold 0.6, then 0.4, then 0.3
        for (const threshold of [0.6, 0.4, 0.3]) {
          similarChunks = await findSimilarChunks(
            session.documentId,
            queryEmbedding,
            10, // Get more chunks
            threshold,
          );
          if (similarChunks.length > 0) break;
        }

        // If still no chunks, get any chunks from the document
        if (similarChunks.length === 0) {
          const allChunks = await prisma.documentEmbedding.findMany({
            where: { documentId: session.documentId },
            orderBy: { chunkIndex: "asc" },
            take: 10,
            select: {
              id: true,
              chunkIndex: true,
              chunkText: true,
              metadata: true,
            },
          });
          similarChunks = allChunks.map((chunk) => ({
            ...chunk,
            similarity: 0.5, // Default similarity for fallback chunks
          }));
        }

        contextChunks = similarChunks.map((chunk) => ({
          chunkIndex: chunk.chunkIndex,
          text: chunk.chunkText,
          similarity: chunk.similarity,
        }));

        // Build context text for prompt (use more text per chunk)
        contextText = similarChunks
          .map(
            (chunk, index) =>
              `[Context ${index + 1}]: ${chunk.chunkText.substring(0, 800)}`,
          )
          .join("\n\n");
      } catch (error: any) {
        console.error("Error retrieving document context:", error);
        // Continue without context if retrieval fails
      }
    }

    // Build conversation history
    const conversationHistory = session.messages.map((msg) => ({
      role: msg.role.toLowerCase(),
      content: msg.content,
    }));

    // Add system prompt if document context exists
    const systemPrompt =
      session.documentId && contextText
        ? `You are an AI tutor helping a student understand a document. Use the following context from the document to answer questions accurately and thoroughly.

Context from document:
${contextText}

Instructions:
- Answer questions based on the document context provided above
- Extract and present relevant information from the context
- If the question asks about specific numbers, dates, or facts, search the context carefully
- Be thorough and cite information from the context when relevant
- If the answer truly cannot be found in the context, say "I don't have enough information in the document to answer this question."
- Be helpful, clear, and educational`
        : session.documentId
          ? "You are an AI tutor helping a student understand a document. However, the document content is not yet available. Please inform the user that the document is still being processed."
          : "You are a helpful AI tutor. Answer questions clearly and provide educational explanations.";

    // Prepare messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role.toLowerCase() as "user" | "assistant" | "system",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: session.model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const assistantMessage = completion.choices[0]?.message?.content || "";

    // Save assistant message with context
    const savedAssistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: assistantMessage,
        contextChunks: contextChunks.length > 0 ? contextChunks : undefined,
        tokenCount: completion.usage?.total_tokens || null,
      },
    });

    // Update session updatedAt
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return res.json({
      message: assistantMessage,
      contextUsed: contextChunks.length > 0,
      contextChunks: contextChunks.length > 0 ? contextChunks : undefined,
      tokenUsage: completion.usage,
    });
  } catch (error: any) {
    console.error("Send message error:", error);
    return res.status(500).json({ error: "Failed to send message" });
  }
};

export const getChatSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;

    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            status: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    return res.json({ session });
  } catch (error: any) {
    console.error("Get chat session error:", error);
    return res.status(500).json({ error: "Failed to fetch chat session" });
  }
};

/**
 * List user's chat sessions
 * GET /api/v1/chat/sessions
 */
export const listChatSessions = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId } = req.query;

    const sessions = await prisma.chatSession.findMany({
      where: {
        userId: req.user.id,
        ...(documentId && { documentId: documentId as string }),
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ sessions });
  } catch (error: any) {
    console.error("List chat sessions error:", error);
    return res.status(500).json({ error: "Failed to fetch chat sessions" });
  }
};

/**
 * Get messages for a chat session
 * GET /api/v1/chat/sessions/:sessionId/messages
 */
export const getChatMessages = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;

    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId: sessionId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        role: true,
        content: true,
        contextChunks: true,
        tokenCount: true,
        createdAt: true,
      },
    });

    return res.json({
      sessionId: sessionId,
      messages: messages,
      count: messages.length,
    });
  } catch (error: any) {
    console.error("Get chat messages error:", error);
    return res.status(500).json({ error: "Failed to fetch chat messages" });
  }
};

/**
 * Delete chat session
 * DELETE /api/v1/chat/sessions/:sessionId
 */
export const deleteChatSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;

    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return res.json({ message: "Chat session deleted successfully" });
  } catch (error: any) {
    console.error("Delete chat session error:", error);
    return res.status(500).json({ error: "Failed to delete chat session" });
  }
};
