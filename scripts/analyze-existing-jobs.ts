
import dotenv from "dotenv";
import { processUnprocessedJobs } from "../src/modules/jobs/job-processor.service";
import { storeMarketTrends } from "../src/modules/jobs/job-trends.service";

dotenv.config();

async function main() {
  console.log("Starting analysis of existing jobs in database...\n");

  try {
    // Step 1: Process any unprocessed jobs
    console.log("Step 1: Processing unprocessed jobs with AI...");
    const processResult = await processUnprocessedJobs(100); // Process up to 100 unprocessed jobs

    console.log(
      `Processed ${processResult.processed} jobs, ${processResult.failed} failed\n`,
    );

    // Step 2: Generate unified market analysis from ALL processed jobs
    console.log("Step 2: Generating unified market analysis with AI...");
    console.log("   (Analyzing ALL processed jobs in database)\n");
    
    await storeMarketTrends("fi", undefined, undefined); // Generate ONE general analysis
    
    console.log("Unified market analysis generated and stored\n");

    console.log("Analysis complete!");
    console.log(`   - ${processResult.processed} jobs processed`);
    console.log(`   - Market analysis generated from all processed jobs`);
    console.log(`   - Ready for frontend to fetch!`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();

