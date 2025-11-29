import { ApifyClient } from "apify-client";
import prisma from "../../utils/prisma";

// Use borderline/indeed-scraper for full job descriptions
const APIFY_ACTOR_ID = "borderline/indeed-scraper";
const APIFY_MAX_ITEMS = 50;

// Popular tech roles to scrape
export const POPULAR_TECH_ROLES = [
  "Software Engineer",
  "Software Developer",
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "DevOps Engineer",
  "Cloud Engineer",
  "Data Engineer",
  "ML Engineer",
  "AI Engineer",
  "QA Engineer",
  "Automation Engineer",
  "Mobile Developer",
  "Senior Software Engineer",
];

// Popular locations in Finland
export const POPULAR_LOCATIONS = [
  "Helsinki",
  "Espoo",
  "Tampere",
  "Oulu",
  "Turku",
];

interface IndeedJobItem {
  // Apify borderline/indeed-scraper actual structure
  jobKey?: string; // External ID (e.g., "ac9d0fdfecaf55b8")
  title?: string; // Job title
  companyName?: string; // Company name
  location?: {
    city?: string;
    country?: string;
    countryCode?: string;
    fullAddress?: string;
    formattedAddressShort?: string;
  } | string; // Location object or string
  descriptionText?: string; // Full job description (text)
  descriptionHtml?: string; // Full job description (HTML)
  jobUrl?: string; // Job URL (e.g., "https://www.indeed.com/viewjob?jk=...")
  datePublished?: string; // Date in format "2025-11-21"
  age?: string; // Relative date (e.g., "8 days ago")
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  } | object; // Salary object (can be empty {})
  jobType?: string[]; // Job type array
  [key: string]: any; // Allow other fields
}

interface ScrapeJobParams {
  role: string;
  location?: string;
  country?: string;
  maxItems?: number;
  daysBack?: number; // Only scrape jobs posted in last N days (default: 14)
}

/**
 * Parse posted date from Indeed format
 */
function parsePostedDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  
  try {
    // Indeed formats: "2024-01-15", "2 days ago", "1 week ago", etc.
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(dateStr);
    }
    
    // Relative dates
    const now = new Date();
    const daysMatch = dateStr.match(/(\d+)\s*days?\s*ago/i);
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1], 10);
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      return date;
    }
    
    const weeksMatch = dateStr.match(/(\d+)\s*weeks?\s*ago/i);
    if (weeksMatch && weeksMatch[1]) {
      const weeks = parseInt(weeksMatch[1], 10);
      const date = new Date(now);
      date.setDate(date.getDate() - weeks * 7);
      return date;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if job was posted within the last N days
 */
function isWithinDays(jobDate: Date | null, daysBack: number): boolean {
  // If no date, accept the job (better to have it than not)
  if (!jobDate) {
    return true;
  }
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  cutoffDate.setHours(0, 0, 0, 0); // Start of day
  
  const jobDateOnly = new Date(jobDate);
  jobDateOnly.setHours(0, 0, 0, 0);
  
  return jobDateOnly >= cutoffDate;
}

/**
 * Extract external ID from Indeed URL
 */
function extractExternalId(url?: string): string | null {
  if (!url) return null;
  
  try {
    // Indeed URLs: https://fi.indeed.com/viewjob?jk=abc123
    const match = url.match(/jk=([^&]+)/);
    if (match && match[1]) {
      return match[1];
    }
    
    // Try parsing as URL
    const urlObj = new URL(url);
    const jk = urlObj.searchParams.get('jk');
    if (jk) {
      return jk;
    }
    
    // Try extracting from path: /viewjob?jk=abc123
    const pathMatch = url.match(/\/viewjob[?&]jk=([^&]+)/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize role name (e.g., "Full Stack Developer" -> "Full Stack Developer")
 */
function normalizeRole(role: string): string {
  return role.trim();
}

/**
 * Scrape jobs from Indeed using Apify
 */
async function scrapeIndeedJobs(
  client: ApifyClient,
  params: ScrapeJobParams,
): Promise<IndeedJobItem[]> {
  const { role, location = "Helsinki", country = "fi", maxItems = APIFY_MAX_ITEMS, daysBack = 14 } = params;
  
  // Cap at 30 jobs max
  const maxRows = Math.min(maxItems || APIFY_MAX_ITEMS, 30);
  
  console.log(`[Job Scraper] Scraping "${role}" in "${location}" (${country}) - max ${maxRows} jobs`);
  
  try {
    const run = await client.actor(APIFY_ACTOR_ID).call({
      query: role, // Use 'query' (singular) not 'queries'
      location: location,
      country: country.toLowerCase(),
      maxRows: maxRows,
      fromDays: String(daysBack), 
    });
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    console.log(`[Job Scraper] Found ${items.length} jobs for "${role}" in "${location}"`);
    
    // Debug: Log first item structure to see what we're getting
    if (items.length > 0) {
      const firstItem = items[0];
      console.log(`[Job Scraper] 🔍 Sample item keys:`, Object.keys(firstItem || {}));
      console.log(`[Job Scraper] 🔍 Sample item (first 800 chars):`, JSON.stringify(firstItem, null, 2).substring(0, 800));
      console.log(`[Job Scraper] 🔍 Key fields check:`, {
        hasJobKey: !!firstItem?.jobKey, // Primary external ID
        hasTitle: !!firstItem?.title, // Job title
        hasCompanyName: !!firstItem?.companyName, // Company
        hasJobUrl: !!firstItem?.jobUrl, // Job URL
        hasDescriptionText: !!firstItem?.descriptionText, // Description
        hasDatePublished: !!firstItem?.datePublished, // ISO date
        hasAge: !!firstItem?.age, // Relative date
        hasLocation: !!firstItem?.location, // Location object
      });
    }
    
    return items as IndeedJobItem[];
  } catch (error) {
    console.error(`[Job Scraper] Error scraping jobs:`, error);
    throw error;
  }
}

/**
 * Store scraped jobs in database
 */
async function storeJobs(
  jobs: IndeedJobItem[],
  params: ScrapeJobParams,
): Promise<number> {
  const { role, location, country = "fi", daysBack = 14 } = params;
  const normalizedRole = normalizeRole(role);
  
  let storedCount = 0;
  let skippedCount = 0;
  
  let skippedDateCount = 0;
  let skippedDuplicateCount = 0;
  let skippedNoIdCount = 0;
  
  for (const job of jobs) {
    try {
      // Parse posted date - Apify provides `datePublished` (ISO format) and `age` (relative)
      const postedDate = parsePostedDate(
        job.datePublished || // Primary: ISO format "2025-11-21"
        job.age || // Fallback: relative "8 days ago"
        job.postedDate || 
        job.datePosted || 
        job.jobPostedDate ||
        job.publishedAt ||
        job.date
      );
      
      // Filter by date (only jobs posted in last N days)
      if (!isWithinDays(postedDate, daysBack)) {
        skippedDateCount++;
        skippedCount++;
        continue;
      }
      
      // Extract external ID - Apify uses `jobKey` as the primary ID
      const jobUrl = job.jobUrl || job.url || job.link || job.jobLink;
      const externalId = 
        job.jobKey || // Primary: Apify uses jobKey (e.g., "ac9d0fdfecaf55b8")
        extractExternalId(jobUrl) || 
        job.externalId || 
        job.jobId || 
        job.id ||
        job.jk ||
        (jobUrl ? (() => {
          try {
            const url = new URL(jobUrl);
            return url.searchParams.get('jk');
          } catch {
            return null;
          }
        })() : null);
      
      if (!externalId) {
        // Only log first few to avoid spam
        if (skippedNoIdCount < 3) {
          console.warn(`[Job Scraper] ⚠️  Skipping job without external ID. Sample:`, {
            title: job.title || job.jobTitle || job.name || "Unknown",
            jobKey: job.jobKey || "MISSING",
            url: jobUrl || "No URL",
            allKeys: Object.keys(job),
          });
        }
        skippedNoIdCount++;
        skippedCount++;
        continue;
      }
      
      // Check if job already exists
      // @ts-ignore - Prisma client will be regenerated after schema migration
      const existing = await (prisma as any).job.findUnique({
        where: { externalId },
      });
      
      if (existing) {
        skippedDuplicateCount++;
        skippedCount++;
        continue; // Skip duplicates
      }
      
      // Parse salary - Apify provides salary as object (can be empty {})
      let salaryMin: number | undefined;
      let salaryMax: number | undefined;
      let salaryCurrency: string | undefined;
      
      if (job.salary && typeof job.salary === "object" && job.salary !== null) {
        // Apify salary is an object: { min?: number, max?: number, currency?: string }
        // Can be empty {} if no salary info
        if (Object.keys(job.salary).length > 0) {
          salaryMin = (job.salary as any).min;
          salaryMax = (job.salary as any).max;
          salaryCurrency = (job.salary as any).currency || "EUR";
        }
      } else if (typeof job.salary === "string" && job.salary) {
        // Fallback: parse from text (e.g., "3000-5000 €/kk")
        const match = (job.salary as string).match(/(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)\s*€|(\d[\d\s]*)\s*€/i);
        if (match) {
          salaryMin = match[1] ? Number(match[1].replace(/\s/g, "")) : undefined;
          salaryMax = match[2] ? Number(match[2].replace(/\s/g, "")) : match[1] ? salaryMin : undefined;
          salaryCurrency = "EUR";
        }
      }
      
      // Store job - use Apify's actual field names (jobUrl already declared above)
      const jobTitle = job.title || job.jobTitle || job.name || "Untitled";
      const jobCompany = job.companyName || job.company || job.employer || null;
      
      // Location can be object or string
      let jobLocation: string | null = null;
      if (typeof job.location === 'object' && job.location !== null) {
        jobLocation = job.location.formattedAddressShort || 
                     job.location.fullAddress || 
                     job.location.city || 
                     location || 
                     null;
      } else if (typeof job.location === 'string') {
        jobLocation = job.location;
      } else {
        jobLocation = location || null;
      }
      
      // Use descriptionText (preferred) or descriptionHtml
      const jobDescription = job.descriptionText || 
                            job.descriptionHtml || 
                            job.description || 
                            job.jobDescription || 
                            job.descriptionRaw || 
                            job.summary || 
                            "";
      
      // @ts-ignore - Prisma client will be regenerated after schema migration
      await (prisma as any).job.create({
        data: {
          externalId,
          title: jobTitle,
          company: jobCompany,
          location: jobLocation,
          country: country.toLowerCase(),
          descriptionRaw: jobDescription,
          url: jobUrl || null,
          postedDate: postedDate || null,
          salaryMin,
          salaryMax,
          salaryCurrency,
          jobType: Array.isArray(job.jobType) ? job.jobType : job.jobType ? [job.jobType] : [],
          role: normalizedRole,
          isProcessed: false,
        },
      });
      
      storedCount++;
    } catch (error) {
      console.error(`[Job Scraper] Error storing job:`, error);
      // Continue with next job
    }
  }
  
  console.log(
    `[Job Scraper] ✅ Stored ${storedCount} jobs, skipped ${skippedCount} total`,
  );
  
  // Log skip reasons (if any)
  if (skippedCount > 0 && storedCount === 0) {
    console.log(`[Job Scraper] ⚠️  All jobs skipped! Checking first job for debugging...`);
    if (jobs.length > 0) {
      const firstJob = jobs[0];
      console.log(`[Job Scraper] Sample job: "${firstJob?.jobTitle}"`);
      console.log(`[Job Scraper]   - Posted date: ${firstJob?.postedDate || "MISSING"}`);
      const sampleDate = parsePostedDate(firstJob?.postedDate);
      console.log(`[Job Scraper]   - Parsed date: ${sampleDate ? sampleDate.toISOString() : "NULL"}`);
      if (sampleDate) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        console.log(`[Job Scraper]   - Cutoff date: ${cutoffDate.toISOString()}`);
        console.log(`[Job Scraper]   - Within ${daysBack} days: ${sampleDate >= cutoffDate}`);
      }
      const sampleId = extractExternalId(firstJob?.url) || firstJob?.externalId;
      console.log(`[Job Scraper]   - External ID: ${sampleId || "MISSING"}`);
    }
  }
  
  return storedCount;
}

/**
 * Main function to scrape and store jobs
 */
export async function scrapeAndStoreJobs(
  params: ScrapeJobParams,
): Promise<{ stored: number; skipped: number }> {
  const apiToken = process.env.APIFY_API_TOKEN;
  
  if (!apiToken) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }
  
  const client = new ApifyClient({
    token: apiToken.trim().replace(/\s+/g, ""),
  });
  
  // Scrape jobs
  const jobs = await scrapeIndeedJobs(client, params);
  
  if (jobs.length === 0) {
    console.log(`[Job Scraper] No jobs found for "${params.role}" in "${params.location}"`);
    return { stored: 0, skipped: 0 };
  }
  
  // Store jobs
  console.log(`[Job Scraper] Storing ${jobs.length} jobs to database...`);
  const stored = await storeJobs(jobs, params);
  
  console.log(`[Job Scraper] ✅ Stored ${stored} jobs, skipped ${jobs.length - stored} (duplicates/old)`);
  
  return {
    stored,
    skipped: jobs.length - stored,
  };
}

/**
 * Scrape multiple roles and locations (for cron job)
 */
export async function scrapePopularJobs(
  roles: string[] = POPULAR_TECH_ROLES,
  locations: string[] = POPULAR_LOCATIONS,
  daysBack: number = 14, // Default: last 14 days
): Promise<{ totalStored: number; totalSkipped: number }> {
  const apiToken = process.env.APIFY_API_TOKEN;
  
  if (!apiToken) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }
  
  const client = new ApifyClient({
    token: apiToken.trim().replace(/\s+/g, ""),
  });
  
  let totalStored = 0;
  let totalSkipped = 0;
  
  console.log(`[Job Scraper] Starting batch scrape for ${roles.length} roles × ${locations.length} locations`);
  
  for (const role of roles) {
    for (const location of locations) {
      try {
        const result = await scrapeAndStoreJobs({
          role,
          location,
          country: "fi",
          daysBack,
          maxItems: 30, // Explicitly set to 30
        });
        
        totalStored += result.stored;
        totalSkipped += result.skipped;
        
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(
          `[Job Scraper] Error scraping ${role} in ${location}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  
  console.log(
    `[Job Scraper] Batch scrape complete: ${totalStored} stored, ${totalSkipped} skipped`,
  );
  
  return { totalStored, totalSkipped };
}

