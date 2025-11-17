"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("./chat.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post(
  "/sessions",
  auth_middleware_1.authenticate,
  chat_controller_1.createChatSession,
);
router.get(
  "/sessions",
  auth_middleware_1.authenticate,
  chat_controller_1.listChatSessions,
);
router.get(
  "/sessions/:sessionId",
  auth_middleware_1.authenticate,
  chat_controller_1.getChatSession,
);
router.delete(
  "/sessions/:sessionId",
  auth_middleware_1.authenticate,
  chat_controller_1.deleteChatSession,
);
router.get(
  "/sessions/:sessionId/messages",
  auth_middleware_1.authenticate,
  chat_controller_1.getChatMessages,
);
router.post(
  "/sessions/:sessionId/messages",
  auth_middleware_1.authenticate,
  chat_controller_1.sendMessage,
);
exports.default = router;
//# sourceMappingURL=chat.routes.js.map
