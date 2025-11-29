import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import { runJobScrapingCronJob, runJobProcessingCronJob } from "./job-cron.service";

/**
 * POST /api/batch/scrape
 * 
 * Trigger full job scraping and processing (for cron jobs)
 * Requires CRON_SECRET_KEY in Authorization header
 */
export const triggerJobScraping = async (
  req: AuthenticatedRequest | any,
  res: Response,
) => {
  try {
    // Check for cron secret key (for external cron services)
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET_KEY;
    
    if (cronSecret) {
      // If CRON_SECRET_KEY is set, require it
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Missing Authorization header",
        });
      }
      
      const token = authHeader.substring(7);
      if (token !== cronSecret) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Invalid cron secret key",
        });
      }
    } else if (req.user) {
      // If no CRON_SECRET_KEY, require authenticated user (for manual triggers)
      // This allows admins to trigger manually
    } else {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Either CRON_SECRET_KEY or authenticated user required",
      });
    }

    console.log("[Job Cron Controller] Triggering job scraping cron job...");
    
    await runJobScrapingCronJob();
    
    return res.json({
      success: true,
      message: "Job scraping cron job completed successfully",
    });
  } catch (error: any) {
    console.error("[Job Cron Controller] Error:", error);
    return res.status(500).json({
      error: "Failed to run job scraping cron job",
      message: error?.message || "Internal server error",
    });
  }
};

/**
 * POST /api/batch/process
 * 
 * Process unprocessed jobs only (can be run more frequently)
 * Requires CRON_SECRET_KEY in Authorization header
 */
export const triggerJobProcessing = async (
  req: AuthenticatedRequest | any,
  res: Response,
) => {
  try {
    // Check for cron secret key (for external cron services)
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET_KEY;
    
    if (cronSecret) {
      // If CRON_SECRET_KEY is set, require it
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Missing Authorization header",
        });
      }
      
      const token = authHeader.substring(7);
      if (token !== cronSecret) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Invalid cron secret key",
        });
      }
    } else if (req.user) {
      // If no CRON_SECRET_KEY, require authenticated user (for manual triggers)
    } else {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Either CRON_SECRET_KEY or authenticated user required",
      });
    }

    console.log("[Job Cron Controller] Triggering job processing cron job...");
    
    await runJobProcessingCronJob();
    
    return res.json({
      success: true,
      message: "Job processing cron job completed successfully",
    });
  } catch (error: any) {
    console.error("[Job Cron Controller] Error:", error);
    return res.status(500).json({
      error: "Failed to run job processing cron job",
      message: error?.message || "Internal server error",
    });
  }
};

