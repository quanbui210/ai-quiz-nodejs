import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  checkQuizLimit,
  validateModelFromBody,
} from "../../middleware/limit-check.middleware";
import {
  createQuiz,
  getQuiz,
  submitAnswers,
  testCreateQuiz,
  suggestQuizTopic,
  validateQuizTopic,
  listQuizzes,
  deleteQuiz,
  pauseQuiz,
  resumeQuiz,
} from "./quiz.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/quiz/suggest-topic:
 *   post:
 *     summary: Suggest specific quiz topics based on a general topic input
 *     description: Takes a broad topic (e.g., "driving license") and suggests 3 specific quiz topics suitable for quiz generation
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userTopic
 *             properties:
 *               userTopic:
 *                 type: string
 *                 description: General topic input (e.g., "driving license", "JavaScript", "math")
 *                 example: "driving license"
 *     responses:
 *       200:
 *         description: List of 3 specific quiz topic suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topics:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Traffic Signs and Signals", "Road Safety Rules", "Vehicle Maintenance"]
 *       400:
 *         description: Invalid request or OpenAI API error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/suggest-topic", authenticate, suggestQuizTopic);

/**
 * @swagger
 * /api/v1/quiz/list/{topicId}:
 *   get:
 *     summary: List all quizzes for a specific topic
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Topic ID
 *     responses:
 *       200:
 *         description: List of quizzes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quizzes:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Quiz"
 */
router.get("/list/:topicId", authenticate, listQuizzes);

/**
 * @swagger
 * /api/v1/quiz/validate-topic:
 *   post:
 *     summary: Validate if a quiz topic name is specific enough for quiz generation
 *     description: Validates that a quiz topic is specific enough (not too general) for generating quiz questions
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Quiz topic name to validate (e.g., "JavaScript Closures" is valid, "JavaScript" is too general)
 *                 example: "JavaScript Closures"
 *     responses:
 *       200:
 *         description: Topic is valid for quiz generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Topic is valid for quiz generation"
 *       400:
 *         description: Topic is not valid (too general or not suitable)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Explanation of why the topic is invalid and suggestion for improvement
 *                 isValid:
 *                   type: boolean
 *                   example: false
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/validate-topic", authenticate, validateQuizTopic);

/**
 * @swagger
 * /api/v1/quiz/create:
 *   post:
 *     summary: Create a new quiz using OpenAI
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId
 *               - title
 *               - difficulty
 *               - questionCount
 *             properties:
 *               topicId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the topic for the quiz
 *               title:
 *                 type: string
 *                 description: Quiz title
 *               difficulty:
 *                 type: string
 *                 enum: [EASY, INTERMEDIATE, ADVANCED]
 *                 description: Quiz difficulty level
 *               questionCount:
 *                 type: number
 *                 description: Number of questions to generate
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 15
 *               timer:
 *                 type: number
 *                 nullable: true
 *                 description: Timer in seconds. Set to null or omit to create quiz without timer. Default is 15 minutes (900 seconds).
 *                 example: 900
 *     responses:
 *       201:
 *         description: Quiz created successfully (without correct answers)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quiz:
 *                   $ref: "#/components/schemas/Quiz"
 *       400:
 *         description: Invalid request or OpenAI API error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post(
  "/create",
  authenticate,
  checkQuizLimit,
  validateModelFromBody,
  createQuiz,
);

/**
 * @swagger
 * /api/v1/quiz/test-create:
 *   post:
 *     summary: Test quiz creation endpoint (for development)
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test quiz created
 */
router.post("/test-create", testCreateQuiz);

/**
 * @swagger
 * /api/v1/quiz/{id}:
 *   get:
 *     summary: Get quiz by ID (without correct answers)
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quiz:
 *                   $ref: "#/components/schemas/Quiz"
 *       404:
 *         description: Quiz not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/:id", authenticate, getQuiz);

/**
 * @swagger
 * /api/v1/quiz/{id}:
 *   delete:
 *     summary: Delete a quiz
 *     description: Delete a quiz and all its related data (questions, answers, attempts). Only the quiz owner can delete it.
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quiz deleted successfully"
 *                 deletedQuizId:
 *                   type: string
 *                   format: uuid
 *                 deletedQuizTitle:
 *                   type: string
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       403:
 *         description: User doesn't have permission to delete this quiz
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       404:
 *         description: Quiz not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.delete("/:id", authenticate, deleteQuiz);

/**
 * @swagger
 * /api/v1/quiz/{quizId}/submit:
 *   post:
 *     summary: Submit quiz answers and get results with correct answers
 *     tags: [Quizzes]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 description: Array of user answers
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                     - answer
 *                   properties:
 *                     questionId:
 *                       type: string
 *                       format: uuid
 *                       description: Question ID
 *                     answer:
 *                       type: string
 *                       description: User's answer
 *                 example:
 *                   - questionId: "123e4567-e89b-12d3-a456-426614174000"
 *                     answer: "Option A"
 *                   - questionId: "123e4567-e89b-12d3-a456-426614174001"
 *                     answer: "Option B"
 *               timeSpent:
 *                 type: number
 *                 description: Time spent on quiz in seconds (optional)
 *                 example: 300
 *               attemptId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional attempt ID when resuming a paused quiz. If provided, the existing attempt will be updated and marked as completed.
 *     responses:
 *       200:
 *         description: Quiz results with correct answers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   $ref: "#/components/schemas/QuizResult"
 *       400:
 *         description: Invalid request or missing answers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       404:
 *         description: Quiz not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/:quizId/submit", authenticate, submitAnswers);

/**
 * @swagger
 * /api/v1/quiz/{quizId}/pause:
 *   post:
 *     summary: Pause a quiz attempt and save current progress
 *     description: Saves the current answers and elapsed time, allowing the user to resume later. The timer is paused.
 *     tags: [Quizzes]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 description: Array of current answers (can be partial)
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                     - userAnswer
 *                   properties:
 *                     questionId:
 *                       type: string
 *                       format: uuid
 *                     userAnswer:
 *                       type: string
 *                 example:
 *                   - questionId: "123e4567-e89b-12d3-a456-426614174000"
 *                     userAnswer: "Option A"
 *                   - questionId: "123e4567-e89b-12d3-a456-426614174001"
 *                     userAnswer: "Option B"
 *               elapsedTime:
 *                 type: number
 *                 description: Time elapsed so far in seconds (for timer)
 *                 example: 300
 *     responses:
 *       200:
 *         description: Quiz paused successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quiz paused successfully"
 *                 attemptId:
 *                   type: string
 *                   format: uuid
 *                 quizId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [PAUSED]
 *                 pausedAt:
 *                   type: string
 *                   format: date-time
 *                 elapsedTime:
 *                   type: number
 *                 answeredQuestions:
 *                   type: number
 *                 totalQuestions:
 *                   type: number
 *                 savedAnswers:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Quiz not found
 *       500:
 *         description: Server error
 */
router.post("/:quizId/pause", authenticate, pauseQuiz);

/**
 * @swagger
 * /api/v1/quiz/{quizId}/resume:
 *   get:
 *     summary: Resume a paused quiz attempt
 *     description: Retrieves a paused quiz attempt with saved answers and elapsed time, allowing the user to continue from where they left off.
 *     tags: [Quizzes]
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
 *         description: Quiz resumed successfully with saved progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attemptId:
 *                   type: string
 *                   format: uuid
 *                 quizId:
 *                   type: string
 *                   format: uuid
 *                 quizTitle:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [IN_PROGRESS]
 *                 elapsedTime:
 *                   type: number
 *                   description: Time elapsed before pause (in seconds)
 *                 totalQuestions:
 *                   type: number
 *                 answeredQuestions:
 *                   type: number
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       text:
 *                         type: string
 *                       type:
 *                         type: string
 *                       options:
 *                         type: object
 *                       savedAnswer:
 *                         type: string
 *                         nullable: true
 *       404:
 *         description: No paused attempt found for this quiz
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get("/:quizId/resume", authenticate, resumeQuiz);

export default router;
