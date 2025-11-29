import cron from "node-cron";
import dotenv from "dotenv";
import { runJobScrapingCronJob, runJobProcessingCronJob } from "./modules/jobs/job-cron.service";

dotenv.config();

// Only enable node-cron if not disabled via env var
// This allows using Railway scheduled tasks or external cron services instead
const DISABLE_NODE_CRON = process.env.DISABLE_NODE_CRON === "true";

if (DISABLE_NODE_CRON) {
  console.log("[Cron] Node-cron disabled (using external cron service or Railway scheduled tasks)");
} else {
  console.log("[Cron] Initializing node-cron jobs...");

  // Bi-monthly job scraping (1st and 15th of each month at 2 AM)
  // Cron format: minute hour day month day-of-week
  // "0 2 1,15 * *" = 2 AM on 1st and 15th of every month
  cron.schedule("0 2 1,15 * *", async () => {
    console.log("[Cron] Running bi-monthly job scraping cron job...");
    try {
      await runJobScrapingCronJob();
    } catch (error) {
      console.error("[Cron] Error in bi-monthly job scraping:", error);
    }
  });

  // Daily job processing (3 AM every day)
  // Process unprocessed jobs that were scraped but not yet processed
  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] Running daily job processing cron job...");
    try {
      await runJobProcessingCronJob();
    } catch (error) {
      console.error("[Cron] Error in daily job processing:", error);
    }
  });

  console.log("[Cron] ✅ Node-cron jobs scheduled:");
  console.log("  - Bi-monthly scraping: 2 AM on 1st and 15th of each month");
  console.log("  - Daily processing: 3 AM every day");
}

