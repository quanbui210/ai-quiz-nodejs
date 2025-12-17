import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  getResult,
  getQuizResult,
  listResults,
  getUserStats,
} from "./results.controller";

const router = Router();


router.get("/:attemptId", authenticate, getResult);


router.get("/", authenticate, listResults);


router.get("/quiz/:quizId", authenticate, getQuizResult);


router.get("/analytics/me", authenticate, getUserStats);

export default router;
