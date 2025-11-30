import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/admin.middleware";
import { runJobScrapingCronJob, runJobProcessingCronJob } from "./job-cron.service";

let isScrapingInProgress = false;

export const triggerJobScraping = async (
  req: AuthenticatedRequest | any,
  res: Response,
) => {
  try {
    if (isScrapingInProgress) {
      return res.status(409).json({
        error: "Job scraping already in progress",
        message: "Please wait for the current scraping job to complete before starting a new one.",
        status: "in_progress",
      });
    }

    isScrapingInProgress = true;
    console.log("[Job Cron Controller] Triggering job scraping cron job (background)...");
    
    runJobScrapingCronJob()
      .then(() => {
        console.log("[Job Cron Controller] Background scraping job completed");
      })
      .catch((error) => {
        console.error("[Job Cron Controller] Background scraping job failed:", error);
      })
      .finally(() => {
        isScrapingInProgress = false;
        console.log("[Job Cron Controller] Scraping lock released");
      });
    
    return res.json({
      success: true,
      message: "Job scraping started in background. This may take 15-30 minutes to complete.",
      status: "running",
      note: "The job will scrape 14 roles × 5 locations (70 combinations). Check server logs for progress.",
    });
  } catch (error: any) {
    console.error("[Job Cron Controller] Error:", error);
    return res.status(500).json({
      error: "Failed to start job scraping cron job",
      message: error?.message || "Internal server error",
    });
  }
};

export const triggerJobProcessing = async (
  req: AuthenticatedRequest | any,
  res: Response,
) => {
  try {
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

