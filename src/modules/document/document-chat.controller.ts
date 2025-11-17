import { Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";

export const getDocumentChatSessions = async (
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

    const sessions = await prisma.chatSession.findMany({
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
  } catch (error: any) {
    console.error("Get document chat sessions error:", error);
    return res.status(500).json({ error: "Failed to fetch document chat sessions" });
  }
};

