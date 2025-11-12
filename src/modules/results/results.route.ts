import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  getResult,
  getQuizResult,
  listResults,
  getUserStats,
} from "./results.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/results/{attemptId}:
 *   get:
 *     summary: Get a specific quiz attempt result
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quiz attempt ID
 *     responses:
 *       200:
 *         description: Quiz attempt result with all answers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     quiz:
 *                       type: object
 *                     score:
 *                       type: number
 *                     correctCount:
 *                       type: number
 *                     totalQuestions:
 *                       type: number
 *                     timeSpent:
 *                       type: number
 *                     completedAt:
 *                       type: string
 *                     answers:
 *                       type: array
 *       404:
 *         description: Attempt not found
 *       403:
 *         description: Access denied
 */
router.get("/:attemptId", authenticate, getResult);

/**
 * @swagger
 * /api/v1/results:
 *   get:
 *     summary: List all quiz attempts for the authenticated user
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: quizId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by quiz ID (optional)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: List of quiz attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attempts:
 *                   type: array
 *                 total:
 *                   type: number
 *                 limit:
 *                   type: number
 *                 offset:
 *                   type: number
 */
router.get("/", authenticate, listResults);

/**
 * @swagger
 * /api/v1/results/quiz/{quizId}:
 *   get:
 *     summary: Get the latest result for a specific quiz
 *     description: Returns the most recent quiz attempt result for the specified quiz
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Latest quiz attempt result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *       404:
 *         description: No attempt found for this quiz
 */
router.get("/quiz/:quizId", authenticate, getQuizResult);

/**
 * @swagger
 * /api/v1/results/analytics/me:
 *   get:
 *     summary: Get comprehensive user analytics for dashboard
 *     description: Returns overall statistics including all topics, quizzes, attempts, performance metrics, and time analytics
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Comprehensive user analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analytics:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalTopics:
 *                           type: number
 *                         totalQuizzes:
 *                           type: number
 *                         totalAttempts:
 *                           type: number
 *                         totalQuestions:
 *                           type: number
 *                     performance:
 *                       type: object
 *                       properties:
 *                         averageScore:
 *                           type: number
 *                         bestScore:
 *                           type: object
 *                         worstScore:
 *                           type: object
 *                     time:
 *                       type: object
 *                       properties:
 *                         totalTimeSpent:
 *                           type: number
 *                         averageTimeSpent:
 *                           type: number
 *                         totalTimeSet:
 *                           type: number
 *                         averageTimeSet:
 *                           type: number
 *                         timeEfficiency:
 *                           type: number
 *                     attemptsByQuiz:
 *                       type: array
 *                     recentAttempts:
 *                       type: array
 */
router.get("/analytics/me", authenticate, getUserStats);

export default router;
