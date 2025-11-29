/**
 * Market Insights Cron Job Service
 * 
 * This service fetches and stores general market insights for popular roles
 * on a weekly/bi-weekly basis to avoid expensive per-request API calls.
 * 
 * Run via cron job or scheduled task:
 * - Weekly: Every Monday at 2 AM
 * - Bi-weekly: Every other Monday at 2 AM
 */

import prisma from "../../utils/prisma";
import {
  fetchAdzunaJobInsights,
  type JobMarketInsights,
} from "./adzuna.service";
import { fetchFinnishJobInsights } from "./finnish-jobs.service";
import { analyzeJobMarketWithAI } from "./market.service";

// Popular roles to pre-fetch (configurable via env or database)
const POPULAR_ROLES = [
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "DevOps Engineer",
  "Cloud Engineer",
  "AI Engineer",
  "ML Engineer",
  "Data Engineer",
  "Automation Engineer",
  "Software Engineer",
  "Senior Software Engineer",
];

// Popular locations per country
const POPULAR_LOCATIONS: Record<string, string[]> = {
  fi: ["Helsinki", "Espoo", "Tampere", "Oulu", "Turku"], // Finland
  gb: ["London", "Manchester", "Birmingham", "Edinburgh"], // UK
  us: ["San Francisco", "New York", "Seattle", "Austin"], // USA
  // Add more countries as needed
};

const DEFAULT_COUNTRY = process.env.ADZUNA_DEFAULT_COUNTRY?.trim().toLowerCase() || "gb";

/**
 * Fetch and store market insights for a specific role and location
 */
async function fetchAndStoreInsights(
  role: string,
  location: string | null,
  country: string,
): Promise<void> {
  try {
    console.log(`[Market Cron] Fetching insights for ${role} in ${location || country} (${country})`);

    const isFinland = country.toLowerCase() === "fi";
    
    let jobMarketData: JobMarketInsights | null = null;
    
    if (isFinland) {
      jobMarketData = await fetchFinnishJobInsights({
        role: role,
        location: location || undefined,
        country: "fi",
      });
    } else {
      jobMarketData = await fetchAdzunaJobInsights({
        role: role,
        location: location || undefined,
        country: country,
      });
    }

    if (!jobMarketData) {
      console.warn(
        `[Market Cron] No data found for ${role} in ${location || country} (${country})`,
      );
      return;
    }

    // Generate general AI analysis (not personalized)
    const aiAnalysis = await analyzeJobMarketWithAI({
      jobMarketData: jobMarketData,
      isGeneral: true, // Generate general insights, not personalized
    });

    // Store in database (upsert)
    await prisma.marketInsight.upsert({
      where: {
        role_location_country: {
          role: role,
          location: location || null,
          country: country,
        },
      },
      create: {
        role: role,
        location: location || null,
        country: country,
        rawData: jobMarketData as any,
        analysis: aiAnalysis as any,
      },
      update: {
        rawData: jobMarketData as any,
        analysis: aiAnalysis as any,
        fetchedAt: new Date(),
      },
    });

    console.log(
      `[Market Cron] ✅ Stored insights for ${role} in ${location || country} (${country})`,
    );
  } catch (error) {
    console.error(
      `[Market Cron] ❌ Failed to fetch/store insights for ${role} in ${location || country}:`,
      error instanceof Error ? error.message : String(error),
    );
    // Continue with other roles even if one fails
  }
}

/**
 * Main cron job function - fetches insights for all popular roles
 */
export async function runMarketInsightsCronJob(): Promise<void> {
  console.log("[Market Cron] Starting market insights cron job...");
  const startTime = Date.now();

  const country = DEFAULT_COUNTRY;
  const locations = POPULAR_LOCATIONS[country] || [null]; // If no locations, fetch country-wide

  let successCount = 0;
  let failCount = 0;

  // Fetch for each role and location combination
  for (const role of POPULAR_ROLES) {
    for (const location of locations) {
      try {
        await fetchAndStoreInsights(role, location, country);
        successCount++;
        
        // Add delay between requests to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
      } catch (error) {
        failCount++;
        console.error(
          `[Market Cron] Error processing ${role} in ${location || country}:`,
          error,
        );
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(
    `[Market Cron] Completed: ${successCount} successful, ${failCount} failed (${duration}s)`,
  );
}

/**
 * Fetch insights for a specific role/location (manual trigger or on-demand)
 */
export async function fetchInsightsForRole(
  role: string,
  location: string | null,
  country: string,
): Promise<void> {
  await fetchAndStoreInsights(role, location, country);
}

