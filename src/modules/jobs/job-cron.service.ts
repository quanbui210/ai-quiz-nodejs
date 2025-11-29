import { scrapePopularJobs } from "./job-scraper.service";
import { processUnprocessedJobs } from "./job-processor.service";
import { storeMarketTrends } from "./job-trends.service";
import { POPULAR_TECH_ROLES, POPULAR_LOCATIONS } from "./job-scraper.service";

/**
 * Main cron job function - runs bi-monthly (1st and 15th)
 * 
 * This function:
 * 1. Scrapes popular tech jobs from Indeed (Finland)
 * 2. Stores raw jobs in database
 * 3. Processes jobs with AI (extract skills, generate embeddings)
 */
export async function runJobScrapingCronJob(): Promise<void> {
  console.log("[Job Cron] Starting bi-monthly job scraping cron job...");
  const startTime = Date.now();

  try {
    // Step 1: Scrape jobs (last 14 days)
    console.log("[Job Cron] Step 1: Scraping jobs from Indeed...");
    const scrapeResult = await scrapePopularJobs(
      undefined, // Use default popular roles
      undefined, // Use default popular locations
      14, // Last 14 days
    );

    console.log(
      `[Job Cron] Scraped ${scrapeResult.totalStored} new jobs, skipped ${scrapeResult.totalSkipped} duplicates/old`,
    );

    // Step 2: Process any unprocessed jobs with AI
    console.log("[Job Cron] Step 2: Processing unprocessed jobs with AI...");
    const processResult = await processUnprocessedJobs(100); // Process up to 100 unprocessed jobs

    console.log(
      `[Job Cron] Processed ${processResult.processed} jobs, ${processResult.failed} failed`,
    );

    // Step 3: Always generate/regenerate unified market analysis
    // (This analyzes ALL processed jobs in the database, not just new ones)
    console.log("[Job Cron] Step 3: Generating unified market analysis with AI...");
    try {
      // Generate ONE general market analysis (all roles, all locations)
      await storeMarketTrends("fi", undefined, undefined);
      console.log("[Job Cron] ✅ Generated unified market analysis");
    } catch (error) {
      console.error("[Job Cron] ❌ Failed to generate market analysis:", error);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[Job Cron] ✅ Cron job completed in ${duration}s: ${scrapeResult.totalStored} scraped, ${processResult.processed} processed`,
    );
  } catch (error) {
    console.error("[Job Cron] ❌ Cron job failed:", error);
    throw error;
  }
}

/**
 * Process unprocessed jobs only (can be run more frequently)
 * Useful for processing jobs that were scraped but not yet processed
 */
export async function runJobProcessingCronJob(): Promise<void> {
  console.log("[Job Cron] Starting job processing cron job...");
  const startTime = Date.now();

  try {
    const result = await processUnprocessedJobs(50); // Process up to 50 jobs per run

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[Job Cron] ✅ Processing cron job completed in ${duration}s: ${result.processed} processed, ${result.failed} failed`,
    );
  } catch (error) {
    console.error("[Job Cron] ❌ Processing cron job failed:", error);
    throw error;
  }
}

/**
 * Pre-calculate market trends for popular role/location combinations
 * This makes general market insights available instantly (zero LLM cost)
 * 
 * Runs after job processing to ensure fresh data
 */
export async function preCalculateMarketTrends(): Promise<void> {
  console.log("[Job Cron] Starting market trends pre-calculation...");
  const startTime = Date.now();

  try {
    const country = "fi"; // Finland
    let calculated = 0;
    let failed = 0;

    // Calculate general trends (all roles, all locations)
    try {
      await storeMarketTrends(country, undefined, undefined);
      calculated++;
      console.log(`[Job Cron] ✅ Calculated general market trends (all roles, all locations)`);
    } catch (error) {
      failed++;
      console.error(`[Job Cron] ❌ Failed to calculate general trends:`, error);
    }

    // Calculate trends for each popular location (all roles)
    for (const location of POPULAR_LOCATIONS) {
      try {
        await storeMarketTrends(country, location, undefined);
        calculated++;
        console.log(`[Job Cron] ✅ Calculated trends for ${location} (all roles)`);
      } catch (error) {
        failed++;
        console.error(`[Job Cron] ❌ Failed to calculate trends for ${location}:`, error);
      }
    }

    // Calculate trends for each popular role (all locations)
    for (const role of POPULAR_TECH_ROLES) {
      try {
        await storeMarketTrends(country, undefined, role);
        calculated++;
        console.log(`[Job Cron] ✅ Calculated trends for ${role} (all locations)`);
      } catch (error) {
        failed++;
        console.error(`[Job Cron] ❌ Failed to calculate trends for ${role}:`, error);
      }
    }

    // Calculate trends for top combinations (role + location)
    // Limit to first 5 roles × first 3 locations to avoid too many calculations
    const topRoles = POPULAR_TECH_ROLES.slice(0, 5);
    const topLocations = POPULAR_LOCATIONS.slice(0, 3);
    
    for (const role of topRoles) {
      for (const location of topLocations) {
        try {
          await storeMarketTrends(country, location, role);
          calculated++;
          console.log(`[Job Cron] ✅ Calculated trends for ${role} in ${location}`);
        } catch (error) {
          failed++;
          console.error(`[Job Cron] ❌ Failed to calculate trends for ${role} in ${location}:`, error);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[Job Cron] ✅ Market trends pre-calculation completed in ${duration}s: ${calculated} calculated, ${failed} failed`,
    );
  } catch (error) {
    console.error("[Job Cron] ❌ Market trends pre-calculation failed:", error);
    throw error;
  }
}

