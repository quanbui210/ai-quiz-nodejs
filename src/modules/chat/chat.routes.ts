import { Router } from "express";
import {
  createChatSession,
  sendMessage,
  getChatSession,
  getChatMessages,
  listChatSessions,
  deleteChatSession,
  getAvailableModels,
  updateChatSessionModel,
} from "./chat.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/models", authenticate, getAvailableModels);

router.post("/sessions", authenticate, createChatSession);
router.get("/sessions", authenticate, listChatSessions);
router.get("/sessions/:sessionId", authenticate, getChatSession);
router.put("/sessions/:sessionId/model", authenticate, updateChatSessionModel);
router.delete("/sessions/:sessionId", authenticate, deleteChatSession);

router.get("/sessions/:sessionId/messages", authenticate, getChatMessages);
router.post("/sessions/:sessionId/messages", authenticate, sendMessage);

export default router;
