"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentChatSessions = void 0;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const getDocumentChatSessions = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { documentId } = req.params;
        const document = await prisma_1.default.document.findFirst({
            where: {
                id: documentId,
                userId: req.user.id,
            },
        });
        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }
        const sessions = await prisma_1.default.chatSession.findMany({
            where: {
                documentId: documentId,
                userId: req.user.id,
            },
            select: {
                id: true,
                title: true,
                model: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        messages: true,
                    },
                },
            },
            orderBy: {
                updatedAt: "desc",
            },
        });
        return res.json({
            documentId: documentId,
            sessions: sessions,
            count: sessions.length,
        });
    }
    catch (error) {
        console.error("Get document chat sessions error:", error);
        return res
            .status(500)
            .json({ error: "Failed to fetch document chat sessions" });
    }
};
exports.getDocumentChatSessions = getDocumentChatSessions;
//# sourceMappingURL=document-chat.controller.js.map