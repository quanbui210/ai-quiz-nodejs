"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const interview_controller_1 = require("./interview.controller");
const router = (0, express_1.Router)();
router.post("/sessions", auth_middleware_1.authenticate, interview_controller_1.createInterviewSession);
router.get("/sessions", auth_middleware_1.authenticate, interview_controller_1.listInterviewSessions);
router.get("/sessions/:sessionId", auth_middleware_1.authenticate, interview_controller_1.getInterviewSession);
router.post("/sessions/:sessionId/questions", auth_middleware_1.authenticate, interview_controller_1.generateNextInterviewQuestion);
router.post("/sessions/:sessionId/questions/:questionId/answer", auth_middleware_1.authenticate, interview_controller_1.submitInterviewAnswer);
router.post("/sessions/:sessionId/complete", auth_middleware_1.authenticate, interview_controller_1.completeInterviewSession);
router.post("/sessions/:sessionId/notes", auth_middleware_1.authenticate, interview_controller_1.addInterviewNote);
router.put("/sessions/:sessionId/notes/:noteId", auth_middleware_1.authenticate, interview_controller_1.updateInterviewNote);
router.delete("/sessions/:sessionId/notes/:noteId", auth_middleware_1.authenticate, interview_controller_1.deleteInterviewNote);
router.delete("/sessions/:sessionId", auth_middleware_1.authenticate, interview_controller_1.deleteInterviewSession);
exports.default = router;
//# sourceMappingURL=interview.routes.js.map