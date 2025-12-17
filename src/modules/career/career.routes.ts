import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { checkCareerRoadmapLimit } from "../../middleware/limit-check.middleware";
import { requireCredits } from "../../middleware/credit-check.middleware";
import { Feature } from "../../services/credit.service";
import {
  cancelRoadmapGeneration,
  createCareerGoal,
  createQuizFromRecommendation,
  deleteCareerGoal,
  exportCareerRoadmapPDF,
  getCareerGoal,
  listCareerGoals,
  regenerateCareerRoadmap,
  suggestCareerQuizTopics,
  updateCareerTaskStatus,
  validateTargetRole,
} from "./career.controller";

const router = Router();

router.post("/validate-target-role", authenticate, validateTargetRole);
router.post("/goals", authenticate, requireCredits(Feature.CAREER_ROADMAP), checkCareerRoadmapLimit, createCareerGoal);
router.get("/goals", authenticate, listCareerGoals);
router.get("/goals/:goalId", authenticate, getCareerGoal);
router.delete("/goals/:goalId/generation", authenticate, cancelRoadmapGeneration);
router.patch(
  "/goals/:goalId/tasks/:taskId",
  authenticate,
  updateCareerTaskStatus,
);
router.post(
  "/goals/:goalId/regenerate",
  authenticate,
  requireCredits(Feature.CAREER_ROADMAP),
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

