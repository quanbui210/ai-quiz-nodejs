import { Router } from "express";
import {
  createQuiz,
  getQuiz,
  submitAnswers,
  testCreateQuiz,
} from "./quiz.controller";

const router = Router();

/**
 * @route   POST /api/v1/quiz
 * @desc    Create a quiz (stores in DB, returns without correct answers)
 * @access  Private
 */
router.post("/create", createQuiz);
router.post("/test-create", testCreateQuiz);

/**
 * @route   GET /api/v1/quiz/:id
 * @desc    Get quiz by ID (without correct answers)
 * @access  Private
 */
router.get("/:id", getQuiz);

/**
 * @route   POST /api/v1/quiz/:quizId/submit
 * @desc    Submit answers and get results with correct answers
 * @access  Private
 */
router.post("/:quizId/submit", submitAnswers);

export default router;
