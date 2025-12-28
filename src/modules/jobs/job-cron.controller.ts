import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/admin.middleware";
import { runJobProcessingCronJob, scrapeJobsOnly } from "./job-cron.service";

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
    console.log("[Job Cron Controller] Triggering job scraping only (no processing, background)...");
    
    scrapeJobsOnly()
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
      message: "Job scraping started in background (fetch only, no AI processing). This may take 30-60 seconds to complete.",
      status: "running",
      note: "Jobs will be fetched and stored, but not analyzed. Use the 'Process Jobs' button to analyze them later.",
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

