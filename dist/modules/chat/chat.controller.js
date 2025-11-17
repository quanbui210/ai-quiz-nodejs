"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChatSession = exports.getChatMessages = exports.listChatSessions = exports.getChatSession = exports.sendMessage = exports.createChatSession = void 0;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const openai_1 = __importDefault(require("openai"));
const embeddings_1 = require("../../utils/embeddings");
const pgvector_1 = require("../../utils/pgvector");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const createChatSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { documentId, title, model } = req.body;
        let document = null;
        if (documentId) {
            document = await prisma_1.default.document.findFirst({
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
        const subscription = await prisma_1.default.userSubscription.findUnique({
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
        if (!generatedTitle && document) {
            try {
                const firstChunks = await prisma_1.default.documentEmbedding.findMany({
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
                                content: "Generate a short, descriptive chat title (max 50 characters) based on the document content. Return only the title, no quotes or extra text.",
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
                }
                else {
                    const filenameWithoutExt = document.filename.replace(/\.[^/.]+$/, "");
                    generatedTitle = `Chat: ${filenameWithoutExt.substring(0, 40)}`;
                }
            }
            catch (error) {
                console.error("Error generating chat title:", error);
                if (document) {
                    const filenameWithoutExt = document.filename.replace(/\.[^/.]+$/, "");
                    generatedTitle = `Chat: ${filenameWithoutExt.substring(0, 40)}`;
                }
            }
        }
        if (documentId) {
            const existingSession = await prisma_1.default.chatSession.findFirst({
                where: {
                    userId: req.user.id,
                    documentId: documentId,
                    model: selectedModel,
                },
                orderBy: { updatedAt: "desc" },
            });
            if (existingSession) {
                if (generatedTitle && !existingSession.title) {
                    session = await prisma_1.default.chatSession.update({
                        where: { id: existingSession.id },
                        data: { title: generatedTitle },
                    });
                }
                else {
                    session = existingSession;
                }
            }
            else {
                session = await prisma_1.default.chatSession.create({
                    data: {
                        userId: req.user.id,
                        documentId: documentId,
                        title: generatedTitle || null,
                        model: selectedModel,
                    },
                });
            }
        }
        else {
            session = await prisma_1.default.chatSession.create({
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
    }
    catch (error) {
        console.error("Create chat session error:", error);
        return res.status(500).json({ error: "Failed to create chat session" });
    }
};
exports.createChatSession = createChatSession;
const sendMessage = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const { message } = req.body;
        if (!message ||
            typeof message !== "string" ||
            message.trim().length === 0) {
            return res.status(400).json({ error: "Message is required" });
        }
        const session = await prisma_1.default.chatSession.findFirst({
            where: {
                id: sessionId,
                userId: req.user.id,
            },
            include: {
                document: true,
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 50,
                },
            },
        });
        if (!session) {
            return res.status(404).json({ error: "Chat session not found" });
        }
        const userMessage = await prisma_1.default.chatMessage.create({
            data: {
                sessionId: session.id,
                role: "USER",
                content: message,
            },
        });
        let contextChunks = [];
        let contextText = "";
        if (session.documentId && session.document?.status === "READY") {
            try {
                const queryEmbedding = await (0, embeddings_1.generateEmbedding)(message);
                let similarChunks = [];
                let similarityThreshold = 0.6;
                for (const threshold of [0.6, 0.4, 0.3]) {
                    similarChunks = await (0, pgvector_1.findSimilarChunks)(session.documentId, queryEmbedding, 10, threshold);
                    if (similarChunks.length > 0)
                        break;
                }
                if (similarChunks.length === 0) {
                    const allChunks = await prisma_1.default.documentEmbedding.findMany({
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
                        similarity: 0.5,
                    }));
                }
                contextChunks = similarChunks.map((chunk) => ({
                    chunkIndex: chunk.chunkIndex,
                    text: chunk.chunkText,
                    similarity: chunk.similarity,
                }));
                contextText = similarChunks
                    .map((chunk, index) => `[Context ${index + 1}]: ${chunk.chunkText.substring(0, 800)}`)
                    .join("\n\n");
            }
            catch (error) {
                console.error("Error retrieving document context:", error);
            }
        }
        const conversationHistory = session.messages.map((msg) => ({
            role: msg.role.toLowerCase(),
            content: msg.content,
        }));
        const systemPrompt = session.documentId && contextText
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
        const messages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory.map((msg) => ({
                role: msg.role.toLowerCase(),
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
        const savedAssistantMessage = await prisma_1.default.chatMessage.create({
            data: {
                sessionId: session.id,
                role: "ASSISTANT",
                content: assistantMessage,
                contextChunks: contextChunks.length > 0 ? contextChunks : undefined,
                tokenCount: completion.usage?.total_tokens || null,
            },
        });
        await prisma_1.default.chatSession.update({
            where: { id: session.id },
            data: { updatedAt: new Date() },
        });
        return res.json({
            message: assistantMessage,
            contextUsed: contextChunks.length > 0,
            contextChunks: contextChunks.length > 0 ? contextChunks : undefined,
            tokenUsage: completion.usage,
        });
    }
    catch (error) {
        console.error("Send message error:", error);
        return res.status(500).json({ error: "Failed to send message" });
    }
};
exports.sendMessage = sendMessage;
const getChatSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const session = await prisma_1.default.chatSession.findFirst({
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
    }
    catch (error) {
        console.error("Get chat session error:", error);
        return res.status(500).json({ error: "Failed to fetch chat session" });
    }
};
exports.getChatSession = getChatSession;
const listChatSessions = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { documentId } = req.query;
        const sessions = await prisma_1.default.chatSession.findMany({
            where: {
                userId: req.user.id,
                ...(documentId && { documentId: documentId }),
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
    }
    catch (error) {
        console.error("List chat sessions error:", error);
        return res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
};
exports.listChatSessions = listChatSessions;
const getChatMessages = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const session = await prisma_1.default.chatSession.findFirst({
            where: {
                id: sessionId,
                userId: req.user.id,
            },
        });
        if (!session) {
            return res.status(404).json({ error: "Chat session not found" });
        }
        const messages = await prisma_1.default.chatMessage.findMany({
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
    }
    catch (error) {
        console.error("Get chat messages error:", error);
        return res.status(500).json({ error: "Failed to fetch chat messages" });
    }
};
exports.getChatMessages = getChatMessages;
const deleteChatSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const session = await prisma_1.default.chatSession.findFirst({
            where: {
                id: sessionId,
                userId: req.user.id,
            },
        });
        if (!session) {
            return res.status(404).json({ error: "Chat session not found" });
        }
        await prisma_1.default.chatSession.delete({
            where: { id: sessionId },
        });
        return res.json({ message: "Chat session deleted successfully" });
    }
    catch (error) {
        console.error("Delete chat session error:", error);
        return res.status(500).json({ error: "Failed to delete chat session" });
    }
};
exports.deleteChatSession = deleteChatSession;
//# sourceMappingURL=chat.controller.js.map