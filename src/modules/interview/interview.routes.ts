import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  addInterviewNote,
  completeInterviewSession,
  createInterviewSession,
  deleteInterviewNote,
  deleteInterviewSession,
  generateNextInterviewQuestion,
  getInterviewSession,
  listInterviewSessions,
  submitInterviewAnswer,
  updateInterviewNote,
} from "./interview.controller";

const router = Router();

router.post("/sessions", authenticate, createInterviewSession);
router.get("/sessions", authenticate, listInterviewSessions);
router.get("/sessions/:sessionId", authenticate, getInterviewSession);
router.post(
  "/sessions/:sessionId/questions",
  authenticate,
  generateNextInterviewQuestion,
);
router.post(
  "/sessions/:sessionId/questions/:questionId/answer",
  authenticate,
  submitInterviewAnswer,
);
router.post(
  "/sessions/:sessionId/complete",
  authenticate,
  completeInterviewSession,
);
router.post("/sessions/:sessionId/notes", authenticate, addInterviewNote);
router.put(
  "/sessions/:sessionId/notes/:noteId",
  authenticate,
  updateInterviewNote,
);
router.delete(
  "/sessions/:sessionId/notes/:noteId",
  authenticate,
  deleteInterviewNote,
);
router.delete("/sessions/:sessionId", authenticate, deleteInterviewSession);

export default router;

