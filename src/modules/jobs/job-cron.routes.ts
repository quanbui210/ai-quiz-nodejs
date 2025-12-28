import { Router } from "express";
import { triggerJobScraping, triggerJobProcessing } from "./job-cron.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/admin.middleware";

const router = Router();


const requireAdminOrCronSecret = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET_KEY;
  
  if (cronSecret && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === cronSecret) {
      return next(); // Allow CRON_SECRET_KEY access
    }
  }
  

  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }
  
  // Check admin access
  return requireAdmin(req, res, next);
};

/**
 * @swagger
 * /api/batch/scrape:
 *   post:
 *     summary: Trigger job scraping and processing (admin endpoint)
 *     description: Scrapes jobs from Indeed and processes them with AI. Requires admin access or CRON_SECRET_KEY for external cron services.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job scraping completed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
// Apply authentication, then check for admin OR cron secret
router.post("/scrape", authenticate, requireAdminOrCronSecret, triggerJobScraping);

/**
 * @swagger
 * /api/batch/process:
 *   post:
 *     summary: Process unprocessed jobs (cron job endpoint)
 *     description: Processes unprocessed jobs with AI. Can be run more frequently than scraping. Requires admin access or CRON_SECRET_KEY.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job processing completed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post("/process", authenticate, requireAdminOrCronSecret, triggerJobProcessing);

export default router;

