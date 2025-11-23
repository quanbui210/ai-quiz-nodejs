import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { checkCareerRoadmapLimit } from "../../middleware/limit-check.middleware";
import {
  createCareerGoal,
  createQuizFromRecommendation,
  deleteCareerGoal,
  exportCareerRoadmapPDF,
  getCareerGoal,
  listCareerGoals,
  regenerateCareerRoadmap,
  suggestCareerQuizTopics,
  updateCareerTaskStatus,
} from "./career.controller";

const router = Router();

router.post("/goals", authenticate, checkCareerRoadmapLimit, createCareerGoal);
router.get("/goals", authenticate, listCareerGoals);
router.get("/goals/:goalId", authenticate, getCareerGoal);
router.patch(
  "/goals/:goalId/tasks/:taskId",
  authenticate,
  updateCareerTaskStatus,
);
router.post(
  "/goals/:goalId/regenerate",
  authenticate,
  regenerateCareerRoadmap,
);
router.get(
  "/goals/:goalId/quiz-suggestions",
  authenticate,
  suggestCareerQuizTopics,
);
router.post(
  "/goals/:goalId/quizzes",
  authenticate,
  createQuizFromRecommendation,
);
router.get(
  "/goals/:goalId/export",
  authenticate,
  exportCareerRoadmapPDF,
);
router.delete("/goals/:goalId", authenticate, deleteCareerGoal);

export default router;

