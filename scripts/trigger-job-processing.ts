/**
 * Manual script to process unprocessed jobs only
 * Use this if you've already scraped jobs but they haven't been processed yet
 * 
 * Usage:
 *   ts-node scripts/trigger-job-processing.ts
 * 
 * Or with npm:
 *   npm run process:jobs
 */

import dotenv from "dotenv";
import { processUnprocessedJobs } from "../src/modules/jobs/job-processor.service";

dotenv.config();

async function main() {
  console.log("🤖 Starting job processing...\n");

  try {
    const result = await processUnprocessedJobs(100); // Process up to 100 jobs

    console.log(`✅ Processed ${result.processed} jobs, ${result.failed} failed\n`);

    if (result.processed === 0) {
      console.log("ℹ️  No unprocessed jobs found. All jobs are already processed!");
    } else {
      console.log("🎉 Job processing complete!");
      console.log(`   - ${result.processed} jobs processed`);
      console.log(`   - Ready for job matching!`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

