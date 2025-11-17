import { Router } from "express";
import {
  createChatSession,
  sendMessage,
  getChatSession,
  getChatMessages,
  listChatSessions,
  deleteChatSession,
} from "./chat.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.post("/sessions", authenticate, createChatSession);
router.get("/sessions", authenticate, listChatSessions);
router.get("/sessions/:sessionId", authenticate, getChatSession);
router.delete("/sessions/:sessionId", authenticate, deleteChatSession);

router.get("/sessions/:sessionId/messages", authenticate, getChatMessages);
router.post("/sessions/:sessionId/messages", authenticate, sendMessage);

export default router;
