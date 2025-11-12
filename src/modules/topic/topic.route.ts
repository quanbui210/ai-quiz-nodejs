import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { createTopic, getTopic, listTopics } from "./topic.controller";

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

export default router;
