import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createTopic,
  getTopic,
  listTopics,
  updateTopic,
  deleteTopic,
} from "./topic.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/topic/list:
 *   get:
 *     summary: List all topics (broad categories)
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of topics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topics:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Topic"
 */
router.get("/list", authenticate, listTopics);

/**
 * @swagger
 * /api/v1/topic/{id}:
 *   get:
 *     summary: Get a topic by ID
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Topic ID
 *     responses:
 *       200:
 *         description: Topic details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Topic"
 *       404:
 *         description: Topic not found
 */
router.get("/:id", getTopic);

/**
 * @swagger
 * /api/v1/topic/create:
 *   post:
 *     summary: Create a new topic
 *     tags: [Topics]
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
 *                 description: Topic name
 *               description:
 *                 type: string
 *                 description: Optional topic description
 *     responses:
 *       201:
 *         description: Topic created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topic:
 *                   $ref: "#/components/schemas/Topic"
 *       400:
 *         description: Invalid request or topic already exists
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
router.post("/create", authenticate, createTopic);

/**
 * @swagger
 * /api/v1/topic/{id}:
 *   put:
 *     summary: Update a topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Topic ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New topic name
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: New topic description (optional)
 *     responses:
 *       200:
 *         description: Topic updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topic:
 *                   $ref: "#/components/schemas/Topic"
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       403:
 *         description: Permission denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       404:
 *         description: Topic not found
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
router.put("/:id", authenticate, updateTopic);

/**
 * @swagger
 * /api/v1/topic/{id}:
 *   delete:
 *     summary: Delete a topic
 *     description: Delete a topic and all its related data (quizzes, questions, attempts, progress, suggestions). Only the topic owner can delete it.
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Topic ID
 *     responses:
 *       200:
 *         description: Topic deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Topic deleted successfully"
 *                 deletedTopicId:
 *                   type: string
 *                   format: uuid
 *                 deletedTopicName:
 *                   type: string
 *                 deletedQuizzesCount:
 *                   type: number
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       403:
 *         description: Permission denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       404:
 *         description: Topic not found
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
router.delete("/:id", authenticate, deleteTopic);

export default router;
