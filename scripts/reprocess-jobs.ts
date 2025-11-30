/**
 * Manual script to re-process already analyzed jobs
 * Use this when you've updated AI prompts or want to refresh job analysis
 * 
 * Usage:
 *   ts-node scripts/reprocess-jobs.ts
 * 
 * Or with npm:
 *   npm run reprocess:jobs
 */

import dotenv from "dotenv";
import { reprocessJobs } from "../src/modules/jobs/job-processor.service";
import { storeMarketTrends } from "../src/modules/jobs/job-trends.service";

dotenv.config();

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : 50;
  const forceAll = process.argv.includes("--all");

  console.log("🔄 Starting job reprocessing...\n");
  console.log(`   Limit: ${limit} jobs`);
  console.log(`   Mode: ${forceAll ? "All jobs (including unprocessed)" : "Only already processed jobs"}\n`);

  try {
    // Step 1: Re-process jobs
    console.log("🤖 Step 1: Re-processing jobs with updated AI analysis...");
    const result = await reprocessJobs(limit, forceAll);

    console.log(
      `✅ Re-processed ${result.processed} jobs, ${result.failed} failed\n`,
    );

    if (result.processed === 0) {
      console.log("ℹ️  No jobs to reprocess found.");
      if (!forceAll) {
        console.log("   Tip: Use --all flag to reprocess all jobs (including unprocessed)");
      }
    } else {
      // Step 2: Regenerate market analysis with updated job data
      console.log("📊 Step 2: Regenerating market analysis with updated job data...");
      await storeMarketTrends("fi", undefined, undefined);
      
      console.log("✅ Market analysis regenerated\n");

      console.log("🎉 Reprocessing complete!");
      console.log(`   - ${result.processed} jobs re-analyzed`);
      console.log(`   - Market analysis regenerated`);
      console.log(`   - Ready for job matching with updated analysis!`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();


