import cron from "node-cron";
import dotenv from "dotenv";
import { runJobScrapingCronJob, runJobProcessingCronJob } from "./modules/jobs/job-cron.service";
import { refreshAllMonthlyCredits } from "./services/credit-cron.service";

dotenv.config();


const DISABLE_NODE_CRON = process.env.DISABLE_NODE_CRON === "true";

if (DISABLE_NODE_CRON) {
  console.log("[Cron] Node-cron disabled (using external cron service or Railway scheduled tasks)");
} else {
  console.log("[Cron] Initializing node-cron jobs...");


  cron.schedule("0 2 1,15 * *", async () => {
    console.log("[Cron] Running bi-monthly job scraping cron job...");
    try {
      await runJobScrapingCronJob();
    } catch (error) {
      console.error("[Cron] Error in bi-monthly job scraping:", error);
    }
  });


  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] Running daily job processing cron job...");
    try {
      await runJobProcessingCronJob();
    } catch (error) {
      console.error("[Cron] Error in daily job processing:", error);
    }
  });


  cron.schedule("0 4 * * *", async () => {
    console.log("[Cron] Running daily credit refresh cron job...");
    try {
      await refreshAllMonthlyCredits();
    } catch (error) {
      console.error("[Cron] Error in credit refresh:", error);
    }
  });

  console.log("[Cron] Node-cron jobs scheduled:");
  console.log("  - Bi-monthly scraping: 2 AM on 1st and 15th of each month");
  console.log("  - Daily processing: 3 AM every day");
  console.log("  - Daily credit refresh: 4 AM every day");
}

