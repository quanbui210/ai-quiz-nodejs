import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createCareerGoal,
  deleteCareerGoal,
  exportCareerRoadmapPDF,
  getCareerGoal,
  listCareerGoals,
  regenerateCareerRoadmap,
  suggestCareerQuizTopics,
  updateCareerTaskStatus,
} from "./career.controller";

const router = Router();

router.post("/goals", authenticate, createCareerGoal);
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
router.get(
  "/goals/:goalId/export",
  authenticate,
  exportCareerRoadmapPDF,
);
router.delete("/goals/:goalId", authenticate, deleteCareerGoal);

export default router;

