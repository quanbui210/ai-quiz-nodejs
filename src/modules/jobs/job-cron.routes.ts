import { Router } from "express";
import { triggerJobScraping, triggerJobProcessing } from "./job-cron.controller";

const router = Router();

/**
 * @swagger
 * /api/batch/scrape:
 *   post:
 *     summary: Trigger job scraping and processing (cron job endpoint)
 *     description: Scrapes jobs from Indeed and processes them with AI. Requires CRON_SECRET_KEY or authenticated user.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job scraping completed successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/scrape", triggerJobScraping);

/**
 * @swagger
 * /api/batch/process:
 *   post:
 *     summary: Process unprocessed jobs (cron job endpoint)
 *     description: Processes unprocessed jobs with AI. Can be run more frequently than scraping.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job processing completed successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/process", triggerJobProcessing);

export default router;

