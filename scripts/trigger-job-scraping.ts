/**
 * Manual script to trigger job scraping and processing
 * Run this locally to populate the database with jobs
 * 
 * Usage:
 *   ts-node scripts/trigger-job-scraping.ts
 * 
 * Or with npm:
 *   npm run scrape:jobs
 */

import dotenv from "dotenv";
import { scrapePopularJobs } from "../src/modules/jobs/job-scraper.service";
import { processUnprocessedJobs } from "../src/modules/jobs/job-processor.service";

dotenv.config();

async function main() {
  console.log("🚀 Starting manual job scraping...\n");

  try {
    // Step 1: Scrape jobs
    console.log("📥 Step 1: Scraping jobs from Indeed...");
    const scrapeResult = await scrapePopularJobs(
      undefined, // Use default popular roles
      undefined, // Use default popular locations
      14, // Last 14 days
    );

    console.log(
      `✅ Scraped ${scrapeResult.totalStored} new jobs, skipped ${scrapeResult.totalSkipped} duplicates/old\n`,
    );

    // Step 2: Process any unprocessed jobs (even if no new jobs were scraped)
    console.log("🤖 Step 2: Processing unprocessed jobs with AI...");
    const processResult = await processUnprocessedJobs(100); // Process up to 100 unprocessed jobs

    console.log(
      `✅ Processed ${processResult.processed} jobs, ${processResult.failed} failed\n`,
    );

  
    console.log("📊 Step 3: Generating unified market analysis with AI...");
    const { storeMarketTrends } = await import("../src/modules/jobs/job-trends.service");
    await storeMarketTrends("fi", undefined, undefined); // Generate ONE general analysis
    console.log("✅ Unified market analysis generated and stored\n");

    console.log("🎉 Job scraping complete!");
    console.log(`   - ${scrapeResult.totalStored} jobs scraped`);
    console.log(`   - ${processResult.processed} jobs processed`);
    console.log(`   - Market trends pre-calculated`);
    console.log(`   - Ready for frontend to fetch!`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

