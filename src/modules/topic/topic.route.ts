import { Router } from "express";
import { createTopic, suggestTopic } from "./topic.controller";

const router = Router();

/**
 * @route   POST /api/topic/suggest
 * @desc    Suggest topics based on user input
 * @access  Private
 */
router.post("/suggest", suggestTopic);
router.post("/create", createTopic);

export default router;
