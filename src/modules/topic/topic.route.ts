import { Router } from "express";
import { suggestTopic } from "./topic.controller";

const router = Router();

/**
 * @route   POST /api/topic/suggest
 * @desc    Suggest topics based on user input
 * @access  Private
*/
router.post('/suggest', suggestTopic);


export default router;