import { scrapePopularJobs } from "./job-scraper.service";
import { processUnprocessedJobs } from "./job-processor.service";
import { storeMarketTrends } from "./job-trends.service";
import { POPULAR_TECH_ROLES, POPULAR_LOCATIONS } from "./job-scraper.service";

export async function runJobScrapingCronJob(): Promise<void> {
  console.log("[Job Cron] Starting bi-monthly job scraping cron job...");
  const startTime = Date.now();

  try {
  
    console.log("[Job Cron] Step 1: Scraping jobs from Indeed...");
    const topRole = POPULAR_TECH_ROLES[0] || "Software Engineer"; 
    const topLocation = POPULAR_LOCATIONS[0] || "Helsinki";
    const jobScrapeNumber = parseInt(process.env.JOB_SCRAPE_NUMBER || "30", 10);
    console.log(`[Job Cron] Scraping "${topRole}" in "${topLocation}" (1 combination, ~${jobScrapeNumber} jobs, ~30 seconds)`)
    
    const scrapeResult = await scrapePopularJobs(
      [topRole ?? ""], 
      [topLocation], 
      14, 
    );

    console.log(
      `[Job Cron] Scraped ${scrapeResult.totalStored} new jobs, skipped ${scrapeResult.totalSkipped} duplicates/old`,
    );

    console.log("[Job Cron] Step 2: Processing unprocessed jobs with AI...");
    const processResult = await processUnprocessedJobs(100);

    console.log(
      `[Job Cron] Processed ${processResult.processed} jobs, ${processResult.failed} failed`,
    );


    console.log("[Job Cron] Step 3: Generating unified market analysis with AI...");
    console.log("[Job Cron]    (This will analyze ALL processed jobs in database, regardless of new scrapes)");
    try {
      await storeMarketTrends("fi", undefined, undefined);
      console.log("[Job Cron] Generated unified market analysis");
    } catch (error) {
      console.error("[Job Cron] Failed to generate market analysis:", error);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[Job Cron] Cron job completed in ${duration}s: ${scrapeResult.totalStored} scraped, ${processResult.processed} processed`,
    );
  } catch (error) {
    console.error("[Job Cron] Cron job failed:", error);
    throw error;
  }
}


export async function runJobProcessingCronJob(): Promise<void> {
  console.log("[Job Cron] Starting job processing cron job...");
  const startTime = Date.now();

  try {
    const result = await processUnprocessedJobs(50); // Process up to 50 jobs per run

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[Job Cron] Processing cron job completed in ${duration}s: ${result.processed} processed, ${result.failed} failed`,
    );
  } catch (error) {
    console.error("[Job Cron] Processing cron job failed:", error);
    throw error;
  }
}

export async function preCalculateMarketTrends(): Promise<void> {
  console.log("[Job Cron] Starting market trends pre-calculation...");
  const startTime = Date.now();

  try {
    const country = "fi";
    let calculated = 0;
    let failed = 0;

    try {
      await storeMarketTrends(country, undefined, undefined);
      calculated++;
      console.log(`[Job Cron] Calculated general market trends (all roles, all locations)`);
    } catch (error) {
      failed++;
      console.error(`[Job Cron] Failed to calculate general trends:`, error);
    }

    for (const location of POPULAR_LOCATIONS) {
      try {
        await storeMarketTrends(country, location, undefined);
        calculated++;
        console.log(`[Job Cron] Calculated trends for ${location} (all roles)`);
      } catch (error) {
        failed++;
        console.error(`[Job Cron] Failed to calculate trends for ${location}:`, error);
      }
    }

    for (const role of POPULAR_TECH_ROLES) {
      try {
        await storeMarketTrends(country, undefined, role);
        calculated++;
        console.log(`[Job Cron] Calculated trends for ${role} (all locations)`);
      } catch (error) {
        failed++;
        console.error(`[Job Cron] Failed to calculate trends for ${role}:`, error);
      }
    }

    const topRoles = POPULAR_TECH_ROLES.slice(0, 5);
    const topLocations = POPULAR_LOCATIONS.slice(0, 3);
    
    for (const role of topRoles) {
      for (const location of topLocations) {
        try {
          await storeMarketTrends(country, location, role);
          calculated++;
          console.log(`[Job Cron] Calculated trends for ${role} in ${location}`);
        } catch (error) {
          failed++;
          console.error(`[Job Cron] Failed to calculate trends for ${role} in ${location}:`, error);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[Job Cron] Market trends pre-calculation completed in ${duration}s: ${calculated} calculated, ${failed} failed`,
    );
  } catch (error) {
    console.error("[Job Cron] Market trends pre-calculation failed:", error);
    throw error;
  }
}

