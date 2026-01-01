import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import OpenAI from "openai";
import { generateEmbedding } from "../../utils/embeddings";
import { findSimilarChunks, findSimilarChunksAcrossDocuments } from "../../utils/pgvector";
import { observeOpenAI } from "@langfuse/openai";

const openai = observeOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}));

export const createChatSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId, documentIds, title, model } = req.body;

    const docIds = documentIds || (documentId ? [documentId] : []);
    
   
    const documents = docIds.length > 0 ? await prisma.document.findMany({
      where: {
        id: { in: docIds },
        userId: req.user.id,
        status: "READY",
      },
    }) : [];

    if (docIds.length > 0 && documents.length !== docIds.length) {
      return res.status(404).json({
        error: "Document not found or not ready",
        message: "One or more documents were not found or are not ready for chat.",
      });
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

    let session: any = null;
    let generatedTitle = title;

    // Generate title from documents if not provided
    if (!generatedTitle && documents.length > 0) {
      try {
        const allFirstChunks = await Promise.all(
          documents.map(async (doc) => {
            const chunks = await prisma.documentEmbedding.findMany({
              where: { documentId: doc.id },
              orderBy: { chunkIndex: "asc" },
              take: 2,
              select: { chunkText: true },
            });
            return { filename: doc.filename, chunks };
          })
        );

        const sampleText = allFirstChunks
          .map(({ filename, chunks }) => {
            const text = chunks.map((c: { chunkText: string }) => c.chunkText.substring(0, 150)).join(" ");
            return `${filename}: ${text}`;
          })
          .join("\n\n");

        if (sampleText.trim().length > 0) {
          const titleCompletion = await openai.chat.completions.create({
            model: selectedModel,
            stream: false,
            messages: [
              {
                role: "system",
                content:
                  "Generate a short, descriptive chat title (max 50 characters) based on the document(s) content. Return only the title, no quotes or extra text.",
              },
              {
                role: "user",
                content: `Documents:\n${documents.map(d => d.filename).join(", ")}\n\nContent sample:\n${sampleText}\n\nGenerate a chat title:`,
              },
            ],
            temperature: 0.7,
            max_tokens: 50,
          });

          generatedTitle =
            titleCompletion.choices[0]?.message?.content?.trim() || null;
        } else {
          const filenames = documents.map(d => d.filename.replace(/\.[^/.]+$/, "")).join(", ");
          generatedTitle = `Chat: ${filenames.substring(0, 40)}`;
        }
      } catch (error: any) {
        console.error("Error generating chat title:", error);
        const filenames = documents.map(d => d.filename.replace(/\.[^/.]+$/, "")).join(", ");
        generatedTitle = `Chat: ${filenames.substring(0, 40)}`;
      }
    }

    // Create or find existing session
    // For backward compatibility, check single documentId first
    const legacyDocumentId = docIds.length === 1 ? docIds[0] : null;
    
    let existingSession = null;
    
    // First, try to find existing session with exact same document set
    if (docIds.length > 0) {
      // Get all sessions for this user and model
      const allSessions = await prisma.chatSession.findMany({
        where: {
          userId: req.user.id,
          model: selectedModel,
        },
        include: {
          sessionDocuments: {
            select: {
              documentId: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Find session with exact same document set
      const requestedDocIdsSorted = [...docIds].sort();
      for (const session of allSessions) {
        const sessionDocIds = (session as any).sessionDocuments
          .map((sd: any) => sd.documentId)
          .sort();
        
        if (
          sessionDocIds.length === requestedDocIdsSorted.length &&
          sessionDocIds.every((id: string, index: number) => id === requestedDocIdsSorted[index])
        ) {
          existingSession = session;
          break;
        }
      }
    }
    
    // Fallback: backward compatibility check for single documentId
    if (!existingSession && legacyDocumentId) {
      existingSession = await prisma.chatSession.findFirst({
        where: {
          userId: req.user.id,
          documentId: legacyDocumentId,
          model: selectedModel,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

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
      
      // Ensure all documents are linked in ChatSessionDocument
      if (docIds.length > 0 && session) {
        await Promise.all(
          docIds.map(async (docId: string) => {
            // Check if link already exists
            const existing = await (prisma as any).chatSessionDocument.findFirst({
              where: {
                sessionId: session.id,
                documentId: docId,
              },
            });
            
            if (!existing) {
              await (prisma as any).chatSessionDocument.create({
                data: {
                  sessionId: session.id,
                  documentId: docId,
                },
              });
            }
          })
        );
      }
    } else {
      // Create new session
      session = await prisma.chatSession.create({
        data: {
          userId: req.user.id,
          documentId: legacyDocumentId, // Keep for backward compatibility
          title: generatedTitle || null,
          model: selectedModel,
        },
      });

      // Link all documents to the session
      if (docIds.length > 0) {
        await Promise.all(
          docIds.map((docId: string) =>
            (prisma as any).chatSessionDocument.create({
              data: {
                sessionId: session.id,
                documentId: docId,
              },
            })
          )
        );
      }
    }

    // Fetch linked documents for response
    const linkedDocuments = docIds.length > 0 ? await (prisma as any).chatSessionDocument.findMany({
      where: { sessionId: session.id },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            status: true,
          },
        },
      },
    }) : [];

    return res.status(201).json({
      message: "Chat session created successfully",
      session: {
        id: session.id,
        documentId: session.documentId, // Legacy field for backward compatibility
        documentIds: linkedDocuments.map((ld: any) => ld.documentId), // New field
        documents: linkedDocuments.map((ld: any) => ld.document), // Full document info
        title: session.title,
        model: session.model,
        createdAt: session.createdAt,
      },
      allowedModels, // Include allowed models for frontend reference
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
        document: true, // Legacy single document
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50, // Last 50 messages for context
        },
      },
    });

    // Get all documents linked to this session
    const sessionDocuments = session ? await (prisma as any).chatSessionDocument.findMany({
      where: { sessionId: session.id },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            status: true,
          },
        },
      },
    }) : [];

    const documentIds = sessionDocuments
      .map((sd: any) => sd.documentId)
      .filter((id: string) => id);
    
    const readyDocuments = sessionDocuments
      .filter((sd: any) => sd.document?.status === "READY")
      .map((sd: any) => sd.document);

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });

    const allowedModels =
      subscription?.allowedModels ||
      subscription?.plan?.allowedModels ||
      ["gpt-3.5-turbo"];

    if (!allowedModels.includes(session.model)) {
      return res.status(403).json({
        error: "Model not allowed for your current subscription",
        message: `The model "${session.model}" used in this session is no longer available with your subscription plan. Please create a new chat session with an allowed model.`,
        allowedModels,
        currentModel: session.model,
      });
    }

    // Save user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content: message,
      },
    });

    let contextChunks: any[] = [];
    let contextText = "";

    // Retrieve context from all linked documents
    console.log(`[Chat] Retrieving context for session ${sessionId}:`, {
      documentIdsCount: documentIds.length,
      documentIds: documentIds,
      readyDocumentsCount: readyDocuments.length,
      readyDocuments: readyDocuments.map((d: any) => ({ id: d.id, filename: d.filename, status: d.status })),
    });

    if (documentIds.length > 0 && readyDocuments.length > 0) {
      try {
        // Generate embedding for user's query
        const queryEmbedding = await generateEmbedding(message);
        console.log(`[Chat] Generated query embedding, searching across ${documentIds.length} document(s)`);

        // Get document filenames for context (needed for both single and multiple document cases)
        const docFilenameMap = new Map<string, string>(
          readyDocuments.map((doc: any) => [doc.id, doc.filename] as [string, string])
        );

        let similarChunks: any[] = [];
        
        if (documentIds.length === 1) {
          // Single document: use existing function
          for (const threshold of [0.6, 0.4, 0.3]) {
            similarChunks = await findSimilarChunks(
              documentIds[0],
              queryEmbedding,
              15,
              threshold,
            );
            if (similarChunks.length > 0) break;
          }

          if (similarChunks.length === 0) {
            const allChunks = await prisma.documentEmbedding.findMany({
              where: { documentId: documentIds[0] },
              orderBy: { chunkIndex: "asc" },
              take: 15,
              select: {
                id: true,
                chunkIndex: true,
                chunkText: true,
                metadata: true,
              },
            });
            similarChunks = allChunks.map((chunk: { id: string; chunkIndex: number; chunkText: string; metadata: any }) => ({
              ...chunk,
              documentId: documentIds[0],
              similarity: 0.5,
            }));
          } else {
            similarChunks = similarChunks.map((chunk: any) => ({
              ...chunk,
              documentId: documentIds[0],
            }));
          }
        } else {
          console.log(`[Chat] Searching across ${documentIds.length} documents for context`);
          
          for (const threshold of [0.6, 0.4, 0.3, 0.2]) {
            similarChunks = await findSimilarChunksAcrossDocuments(
              documentIds,
              queryEmbedding,
              30, 
              threshold,
            );
            console.log(`[Chat] Found ${similarChunks.length} chunks at threshold ${threshold}`);
            if (similarChunks.length >= 5) break; 
          }

          const chunksByDocument = new Map<string, any[]>();
          similarChunks.forEach((chunk) => {
            const docId = chunk.documentId;
            if (!chunksByDocument.has(docId)) {
              chunksByDocument.set(docId, []);
            }
            chunksByDocument.get(docId)!.push(chunk);
          });

          // CRITICAL: Ensure we have chunks from ALL documents, not just the most relevant ones
          // This prevents the AI from only seeing one document when multiple are selected
          const minChunksPerDocument = Math.max(5, Math.floor(20 / documentIds.length)); // At least 5 chunks per doc
          console.log(`[Chat] Ensuring at least ${minChunksPerDocument} chunks per document (total: ${documentIds.length} documents)`);
          
          // First, check which documents are missing chunks
          const documentsNeedingChunks: string[] = [];
          for (const docId of documentIds) {
            const existingChunks = chunksByDocument.get(docId) || [];
            const docName = docFilenameMap.get(docId) || docId;
            console.log(`[Chat] Document ${docName}: ${existingChunks.length} chunks (target: ${minChunksPerDocument})`);
            
            if (existingChunks.length < minChunksPerDocument) {
              documentsNeedingChunks.push(docId);
            }
          }
          
          // For each document that needs more chunks, fetch them aggressively
          for (const docId of documentsNeedingChunks) {
            const existingChunks = chunksByDocument.get(docId) || [];
            const needed = minChunksPerDocument - existingChunks.length;
            const docName = docFilenameMap.get(docId) || docId;
            
              console.log(`[Chat] Fetching ${needed} more chunks for ${docName}...`);
              
              const existingChunkIds = new Set(existingChunks.map((c: any) => c.id));
              let newChunks: any[] = [];
              
              // Strategy 1: Try similarity search with very low threshold
              try {
                const additionalChunks = await findSimilarChunksAcrossDocuments(
                  [docId],
                  queryEmbedding,
                  needed + 5, // Get extra to account for filtering
                  0.05, // Very very low threshold - almost anything will match
                );
                
                newChunks = additionalChunks
                  .filter((chunk: any) => !existingChunkIds.has(chunk.id))
                  .slice(0, needed);
                
                console.log(`[Chat] Similarity search (0.05 threshold) found ${newChunks.length} chunks for ${docName}`);
              } catch (error: any) {
                console.warn(`[Chat] Similarity search failed for ${docName}:`, error.message);
              }
              
              // Strategy 2: If still not enough, get chunks directly from database (no similarity filter at all)
              if (newChunks.length < needed) {
                try {
                  const totalChunksInDoc = await prisma.documentEmbedding.count({
                    where: { documentId: docId },
                  });
                  
                  console.log(`[Chat] Document ${docName} has ${totalChunksInDoc} total chunks in database`);
                  
                  if (totalChunksInDoc > 0) {
                    const fallbackChunks = await prisma.documentEmbedding.findMany({
                      where: { 
                        documentId: docId,
                        ...(existingChunkIds.size > 0 && { id: { notIn: Array.from(existingChunkIds) } }),
                      },
                      orderBy: { chunkIndex: "asc" },
                      take: needed - newChunks.length + 3, // Get a few extra
                      select: {
                        id: true,
                        chunkIndex: true,
                        chunkText: true,
                        metadata: true,
                      },
                    });
                    
                    const fallbackWithDocId = fallbackChunks.map((chunk: any) => ({
                      ...chunk,
                      documentId: docId,
                      similarity: 0.15, // Low similarity but included for completeness
                    }));
                    
                    // Add to newChunks, avoiding duplicates
                    const newChunkIds = new Set(newChunks.map((c: any) => c.id));
                    const uniqueFallback = fallbackWithDocId.filter((c: any) => !newChunkIds.has(c.id));
                    
                    newChunks = [...newChunks, ...uniqueFallback].slice(0, needed);
                    console.log(`[Chat] Database fallback added ${uniqueFallback.length} chunks from ${docName}`);
                  } else {
                    console.warn(`[Chat] WARNING: Document ${docName} has NO chunks in database - document may not be processed`);
                  }
                } catch (error: any) {
                  console.error(`[Chat] Database fallback failed for ${docName}:`, error.message);
                }
              }
              
              // Update the chunks for this document
              if (newChunks.length > 0) {
                chunksByDocument.set(docId, [...existingChunks, ...newChunks]);
                console.log(`[Chat] SUCCESS: ${docName} now has ${existingChunks.length + newChunks.length} chunks (target: ${minChunksPerDocument})`);
              } else {
                console.error(`[Chat] ERROR: FAILED to fetch chunks for ${docName} - this document will be missing from context!`);
              }
          }

          similarChunks = Array.from(chunksByDocument.values()).flat();
          
          similarChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
          
          const maxTotalChunks = 25;
          if (similarChunks.length > maxTotalChunks) {
            const finalChunks: any[] = [];
            const chunksTakenPerDoc = new Map<string, number>();
            
            for (const chunk of similarChunks) {
              const docId = chunk.documentId;
              const taken = chunksTakenPerDoc.get(docId) || 0;
              
              if (finalChunks.length < maxTotalChunks || taken < 2) {
                finalChunks.push(chunk);
                chunksTakenPerDoc.set(docId, taken + 1);
              }
            }
            
            similarChunks = finalChunks;
          }
          
          console.log(`[Chat] Final chunks distribution:`, 
            Object.fromEntries(
              Array.from(chunksByDocument.entries()).map(([docId, chunks]) => [
                docFilenameMap.get(docId) || docId,
                chunks.length
              ])
            )
          );
        }

        contextChunks = similarChunks.map((chunk) => ({
          documentId: chunk.documentId,
          documentFilename: docFilenameMap.get(chunk.documentId) || "Unknown",
          chunkIndex: chunk.chunkIndex,
          text: chunk.chunkText,
          similarity: chunk.similarity,
        }));

        // Build context text with document labels
        contextText = similarChunks
          .map((chunk, index) => {
            const docName = docFilenameMap.get(chunk.documentId) || "Document";
            return `[${docName} - Context ${index + 1}]: ${chunk.chunkText.substring(0, 2000)}`;
          })
          .join("\n\n");
        
        // Log which documents contributed chunks
        const chunksByDocument = new Map<string, number>();
        similarChunks.forEach((chunk) => {
          const docName: string = docFilenameMap.get(chunk.documentId) || "Unknown";
          const currentCount = chunksByDocument.get(docName) ?? 0;
          chunksByDocument.set(docName, currentCount + 1);
        });
        
        console.log(`[Chat] Built context text: ${contextText.length} characters from ${similarChunks.length} chunks`);
        console.log(`[Chat] Chunks by document:`, Object.fromEntries(chunksByDocument));
        console.log(`[Chat] Total documents in context: ${chunksByDocument.size} out of ${readyDocuments.length} ready documents`);
      } catch (error: any) {
        console.error("[Chat] Error retrieving document context:", error);
        console.error("[Chat] Error details:", {
          documentIds,
          readyDocuments: readyDocuments.map((d: any) => d.id),
          errorMessage: error.message,
          errorStack: error.stack,
        });
        // Continue without context if retrieval fails
      }
    } else {
      console.warn(`[Chat] No context retrieved: documentIds.length=${documentIds.length}, readyDocuments.length=${readyDocuments.length}`);
    }

    const conversationHistory = session.messages.map((msg: { role: string; content: string }) => ({
      role: msg.role.toLowerCase(),
      content: msg.content,
    }));

    const hasDocuments = documentIds.length > 0;
    const hasReadyDocuments = readyDocuments.length > 0;
    const isMultipleDocuments = documentIds.length > 1;
    const documentNames = readyDocuments.map((d: any) => d.filename).join(", ");

    let systemPrompt = "";
    
    if (hasDocuments && hasReadyDocuments) {
      if (contextText && contextText.length > 0) {
        // Documents are attached and context is available
        systemPrompt = `You are an AI assistant helping a user with ${isMultipleDocuments ? "multiple documents" : "a document"}. 

IMPORTANT: The user has attached ${isMultipleDocuments ? "the following documents" : "the following document"} to this conversation:
${documentNames.split(", ").map((name: string, i: number) => `${i + 1}. ${name}`).join("\n")}

You HAVE ACCESS to the content of ${isMultipleDocuments ? "these documents" : "this document"}. Use the following context extracted from ${isMultipleDocuments ? "the documents" : "the document"} to answer questions:

${isMultipleDocuments ? "Context from documents (each section is labeled with the document name):" : "Context from document:"}
${contextText}

CRITICAL INSTRUCTIONS:
- You CAN and MUST use the information from the attached ${isMultipleDocuments ? "documents" : "document"}
- Answer questions based on the document context provided above
- ${isMultipleDocuments ? "When referencing information, indicate which document it comes from (use the document name from the context labels)" : ""}
- Extract and present relevant information from the context
- If the question asks about specific numbers, dates, or facts, search the context carefully
- Be thorough and cite information from the context when relevant
- If the answer cannot be found in the context, you MUST say: "I don't have enough information in the ${isMultipleDocuments ? "documents" : "document"} to answer this question. The ${isMultipleDocuments ? "documents" : "document"} context provided does not contain information about [topic]."
- DO NOT say you cannot access files or attachments - you CAN access them through the context provided above
- Be helpful, clear, and educational`;
      } else {
        // Documents are attached but no context retrieved (might be empty documents or retrieval issue)
        systemPrompt = `You are an AI assistant helping a user with ${isMultipleDocuments ? "multiple documents" : "a document"}. 

IMPORTANT: The user has attached ${isMultipleDocuments ? "the following documents" : "the following document"} to this conversation:
${documentNames.split(", ").map((name: string, i: number) => `${i + 1}. ${name}`).join("\n")}

However, I was unable to retrieve specific content from ${isMultipleDocuments ? "these documents" : "this document"} at this time. Please ask the user to provide more specific questions or to paste relevant content from ${isMultipleDocuments ? "the documents" : "the document"} if needed.`;
      }
    } else if (hasDocuments && !hasReadyDocuments) {
      // Documents are attached but not ready
      systemPrompt = `You are an AI assistant helping a user with ${isMultipleDocuments ? "multiple documents" : "a document"}. However, ${isMultipleDocuments ? "one or more of the documents" : "the document"} content is not yet available. Please inform the user that ${isMultipleDocuments ? "the documents" : "the document"} ${isMultipleDocuments ? "are" : "is"} still being processed.`;
    } else {
      // No documents attached
      systemPrompt = "You are a helpful AI assistant. Answer questions clearly and provide educational explanations.";
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role.toLowerCase() as "user" | "assistant" | "system",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

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


export const getAvailableModels = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });

    const allowedModels =
      subscription?.allowedModels ||
      subscription?.plan?.allowedModels ||
      ["gpt-3.5-turbo"];

    const modelInfo: Record<string, { name: string; description: string }> = {
      "gpt-3.5-turbo": {
        name: "GPT-3.5 Turbo",
        description: "Fast and efficient, good for most tasks",
      },
      "gpt-4": {
        name: "GPT-4",
        description: "More capable, better reasoning and accuracy",
      },
      "gpt-4-turbo": {
        name: "GPT-4 Turbo",
        description: "Latest GPT-4 with improved performance",
      },
      "gpt-4o": {
        name: "GPT-4o",
        description: "Optimized GPT-4 model",
      },
    };

    const models = allowedModels.map((model) => ({
      id: model,
      ...(modelInfo[model] || {
        name: model,
        description: "AI model",
      }),
    }));

    return res.json({
      models,
      defaultModel: allowedModels[0],
    });
  } catch (error: any) {
    console.error("Get available models error:", error);
    return res.status(500).json({ error: "Failed to fetch available models" });
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

    // Get all documents linked to this session
    const sessionDocuments = await (prisma as any).chatSessionDocument.findMany({
      where: { sessionId: session.id },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            status: true,
          },
        },
      },
    });

    return res.json({
      session: {
        ...session,
        documentIds: sessionDocuments.map((sd: any) => sd.documentId),
        documents: sessionDocuments.map((sd: any) => sd.document),
      },
    });
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

    // Support both documentId (single, backward compatibility) and documentIds (array)
    const { documentId, documentIds } = req.query;
    let requestedDocIds: string[] = [];
    
    if (documentIds) {
      // Handle array or comma-separated string
      if (Array.isArray(documentIds)) {
        requestedDocIds = documentIds as string[];
      } else if (typeof documentIds === "string") {
        requestedDocIds = documentIds.split(",").map(id => id.trim()).filter(Boolean);
      }
    } else if (documentId) {
      // Backward compatibility: single documentId
      requestedDocIds = [documentId as string];
    }

    // Get all sessions for the user
    let sessions = await prisma.chatSession.findMany({
      where: {
        userId: req.user.id,
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

    // Get all documents for each session
    const sessionsWithDocuments = await Promise.all(
      sessions.map(async (session) => {
        const sessionDocuments = await (prisma as any).chatSessionDocument.findMany({
          where: { sessionId: session.id },
          include: {
            document: {
              select: {
                id: true,
                filename: true,
                status: true,
              },
            },
          },
        });

        const sessionDocIds = sessionDocuments.map((sd: any) => sd.documentId).sort();
        
        return {
          ...session,
          documentIds: sessionDocIds,
          documents: sessionDocuments.map((sd: any) => sd.document),
        };
      })
    );

    // Filter sessions to match the requested documentIds (if provided)
    let filteredSessions = sessionsWithDocuments;
    if (requestedDocIds.length > 0) {
      const requestedDocIdsSorted = [...requestedDocIds].sort();
      filteredSessions = sessionsWithDocuments.filter((session) => {
        // Check if session has exactly the same set of documents
        const sessionDocIdsSorted = [...session.documentIds].sort();
        return (
          sessionDocIdsSorted.length === requestedDocIdsSorted.length &&
          sessionDocIdsSorted.every((id, index) => id === requestedDocIdsSorted[index])
        );
      });
    }

    return res.json({ sessions: filteredSessions });
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


export const updateChatSessionModel = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    const { model } = req.body;

    if (!model || typeof model !== "string") {
      return res.status(400).json({ error: "Model is required" });
    }

    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
      include: { plan: true },
    });

    const allowedModels =
      subscription?.allowedModels ||
      subscription?.plan?.allowedModels ||
      ["gpt-3.5-turbo"];

    if (!allowedModels.includes(model)) {
      return res.status(403).json({
        error: "Model not allowed for your subscription",
        message: `The model "${model}" is not available with your current subscription plan.`,
        allowedModels,
        requestedModel: model,
      });
    }

    // Update session model
    const updatedSession = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { model },
      select: {
        id: true,
        documentId: true,
        title: true,
        model: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Chat session model updated successfully",
      session: updatedSession,
      allowedModels, // Include for frontend reference
    });
  } catch (error: any) {
    console.error("Update chat session model error:", error);
    return res
      .status(500)
      .json({ error: "Failed to update chat session model" });
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
