import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { requireCredits } from "../../middleware/credit-check.middleware";
import { Feature } from "../../services/credit.service";
import {
  cancelSkillMasteryGeneration,
  createSkillMasteryGoal,
  deleteSkillMasteryGoal,
  getAvailableSkills,
  getSkillMasteryGoal,
  listSkillMasteryGoals,
  updateSkillMasteryTaskStatus,
} from "./skill-mastery.controller";
import {
  createUserQuiz,
  getGoalQuizzes,
  getQuizResults,
  getQuizTemplate,
  startQuiz,
  submitQuizAnswers,
} from "./skill-mastery-quiz.controller";

const router = Router();

router.get("/available-skills", getAvailableSkills);

router.get("/quizzes/templates/:skillName/:phase", getQuizTemplate);

router.post("/goals", authenticate, requireCredits(Feature.SKILL_MASTERY_ROADMAP), createSkillMasteryGoal);
router.get("/goals", authenticate, listSkillMasteryGoals);
router.get("/goals/:goalId", authenticate, getSkillMasteryGoal);
router.delete("/goals/:goalId/generation", authenticate, cancelSkillMasteryGeneration);
router.patch(
  "/goals/:goalId/tasks/:taskId",
  authenticate,
  updateSkillMasteryTaskStatus,
);
router.delete("/goals/:goalId", authenticate, deleteSkillMasteryGoal);

// Quiz endpoints (authenticated)
router.post("/goals/:goalId/quizzes", authenticate, createUserQuiz);
router.get("/goals/:goalId/quizzes", authenticate, getGoalQuizzes);
router.post("/quizzes/:quizId/start", authenticate, startQuiz);
router.post("/quizzes/:quizId/submit", authenticate, submitQuizAnswers);
router.get("/quizzes/:quizId/results", authenticate, getQuizResults);

export default router;

