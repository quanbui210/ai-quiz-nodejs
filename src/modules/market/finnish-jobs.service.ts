import { ApifyClient } from "apify-client";
import { SKILL_DICTIONARY } from "./skills-dictionary";

// Legacy types (for backward compatibility during migration)
export interface JobMarketInsights {
  role: string;
  location?: string;
  country: string;
  fetchedAt: Date;
  sampleSize: number;
  totalAvailable: number;
  salary?: {
    min?: number;
    max?: number;
    median?: number;
    average?: number;
    currency?: string;
    sampleSize?: number;
  };
  requiredSkills: SkillStat[];
  niceToHaveSkills: SkillStat[];
  technicalSkills: SkillStat[];
  softSkills: SkillStat[];
  domainKnowledge: SkillStat[];
  topCompanies: string[];
  sampleListings: JobListingSummary[];
}

export interface SkillStat {
  skill: string;
  count: number;
  percentage: number;
  category: "technical" | "soft" | "domain" | "process";
}

export interface JobListingSummary {
  title: string;
  company: string;
  location: string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  url?: string;
}

export interface FetchAdzunaJobInsightsParams {
  role: string;
  location?: string;
  country?: string;
  resultsPerPage?: number;
}

// Use Indeed scraper for better data quality (full descriptions, company, salary)
const APIFY_ACTOR_ID = "misceres/indeed-scraper";
const APIFY_MAX_ITEMS = 50;

interface IndeedJobItem {
  positionName?: string;
  company?: string;
  location?: string;
  description?: string;
  salary?: string | {
    min?: number;
    max?: number;
    currency?: string;
  } | null; // Indeed often returns null for salary
  jobType?: string[]; // e.g., ["Kokopäivätyö"] (Full-time in Finnish)
  reviewsCount?: number;
  rating?: number;
  url?: string;
  postedDate?: string;
  // Company details (if parseCompanyDetails: true)
  companyDetails?: {
    website?: string;
    size?: string;
    industry?: string;
    description?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

function parseSalaryFromText(text?: string): {
  min?: number;
  max?: number;
  currency?: string;
} {
  if (!text) return {};

  // Try to extract salary from Finnish format (e.g., "3000-5000 €/kk" or "4000€")
  const salaryMatch = text.match(
    /(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)\s*€|(\d[\d\s]*)\s*€/i,
  );
  if (salaryMatch) {
    const min = salaryMatch[1]
      ? Number(salaryMatch[1].replace(/\s/g, ""))
      : undefined;
    const max = salaryMatch[2]
      ? Number(salaryMatch[2].replace(/\s/g, ""))
      : salaryMatch[1]
        ? min
        : undefined;
    const single = salaryMatch[3]
      ? Number(salaryMatch[3].replace(/\s/g, ""))
      : undefined;

    return {
      min: min || single,
      max: max || single,
      currency: "EUR",
    };
  }

  return {};
}

function extractSkillsFromText(text: string): Set<string> {
  const foundSkills = new Set<string>();
  const normalizedText = text.toLowerCase();

  SKILL_DICTIONARY.forEach((entry) => {
    if (entry.patterns.some((pattern) => pattern.test(normalizedText))) {
      foundSkills.add(entry.label);
    }
  });

  return foundSkills;
}

function extractCompanyFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  
  // Try to extract company from patterns like:
  // "Company Name: Job Title"
  // "Job Title, Company Name"
  // "Company Name / Location"
  // "Job Title - Company Name"
  
  // Common patterns in Finnish job titles
  const patterns = [
    /^([^:]+):/, // "Company: Title"
    /,\s*([^,]+)$/, // "Title, Company"
    /^([^/]+)\s*\/\s*[^/]+$/, // "Company / Location"
    /-\s*([^-]+)$/, // "Title - Company"
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const company = match[1].trim();
      // Filter out common non-company words
      if (company.length > 2 && !/^(Helsinki|Espoo|Tampere|Oulu|Vantaa|Turku)$/i.test(company)) {
        return company;
      }
    }
  }
  
  return undefined;
}

function extractLocationFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  
  // Extract location from title patterns like:
  // "Job Title, Helsinki"
  // "Job Title / Helsinki"
  // "Job Title (Helsinki)"
  
  const locationPatterns = [
    /,\s*([A-ZÄÖÅ][a-zäöå]+(?:\s+[A-ZÄÖÅ][a-zäöå]+)*)$/, // "Title, Helsinki"
    /\s*\/\s*([A-ZÄÖÅ][a-zäöå]+(?:\s+[A-ZÄÖÅ][a-zäöå]+)*)$/, // "Title / Helsinki"
    /\(([A-ZÄÖÅ][a-zäöå]+(?:\s+[A-ZÄÖÅ][a-zäöå]+)*)\)$/, // "Title (Helsinki)"
  ];
  
  const finnishCities = [
    "Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu", "Turku", "Jyväskylä",
    "Lahti", "Kuopio", "Pori", "Kouvola", "Joensuu", "Lappeenranta", "Hämeenlinna",
    "Vaasa", "Seinäjoki", "Rovaniemi", "Mikkeli", "Kotka", "Salo",
  ];
  
  for (const pattern of locationPatterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      if (finnishCities.some(city => location.includes(city) || city.includes(location))) {
        return location;
      }
    }
  }
  
  return undefined;
}

function parseFinnishDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  
  // Convert Finnish format "7.9.2025" to ISO format
  // Format: "d.M.yyyy" or "dd.M.yyyy"
  const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (match) {
    const day = match[1]?.padStart(2, '0');
    const month = match[2]?.padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}T00:00:00Z`;
  }
  
  return undefined;
}

function analyzeIndeedJobPostings(
  params: FetchAdzunaJobInsightsParams,
  items: IndeedJobItem[],
  searchLocation: string,
): JobMarketInsights {
  // Filter out invalid jobs first
  const validItems = items.filter(
    (item) =>
      item.positionName &&
      item.positionName.trim() !== "" &&
      item.positionName !== "Untitled" &&
      item.url, // Must have URL
  );

  if (validItems.length === 0) {
    console.warn(
      `[Finnish Jobs] No valid job items after filtering (${items.length} total items, all invalid)`,
    );
    // Return minimal structure
    return {
      role: params.role,
      query: params.role,
      country: "fi",
      location: params.location || searchLocation || undefined,
      fetchedAt: new Date().toISOString(),
      sampleSize: 0,
      totalAvailable: 0,
      requiredSkills: [],
      niceToHaveSkills: [],
      technicalSkills: [],
      softSkills: [],
      domainKnowledge: [],
      topCompanies: [],
      sampleListings: [],
    };
  }

  const requiredSkillsMap = new Map<string, number>();
  const niceToHaveSkillsMap = new Map<string, number>();
  const technicalSkillsMap = new Map<string, number>();
  const softSkillsMap = new Map<string, number>();
  const domainMap = new Map<string, number>();

  const salarySamples: number[] = [];
  const companySet = new Set<string>();

  validItems.forEach((item) => {
    // Indeed provides company name directly
    const companyName = item.company?.trim();
    if (companyName) {
      companySet.add(companyName);
    }

    // Indeed provides location directly
    const jobLocation = item.location?.trim() || searchLocation || "Finland";

    // Salary extraction from Indeed (can be string, object, or null)
    let salaryInfo: { min?: number; max?: number; currency?: string } = {};
    if (item.salary === null || item.salary === undefined) {
      // Salary not available (common in Indeed)
      salaryInfo = {};
    } else if (typeof item.salary === "string") {
      salaryInfo = parseSalaryFromText(item.salary);
    } else if (typeof item.salary === "object") {
      salaryInfo = {
        min: item.salary.min,
        max: item.salary.max,
        currency: item.salary.currency || "EUR",
      };
    }

    if (salaryInfo.min) {
      salarySamples.push(salaryInfo.min);
    }
    if (salaryInfo.max) {
      salarySamples.push(salaryInfo.max);
    }

    // Indeed provides full descriptions - this is the key advantage!
    const combinedText = [
      item.positionName, // Indeed uses "positionName"
      item.description, // Full description available!
      jobLocation,
    ]
      .filter(Boolean)
      .join("\n");

    const skills = extractSkillsFromText(combinedText);

    // Indeed provides full descriptions - we can properly categorize skills
    // Check if description contains "required", "must have", etc. for categorization
    const descriptionText = item.description?.toLowerCase() || "";
    const isRequiredSection = /required|must have|need to have|essential|looking for|we require/i.test(descriptionText);
    const isNiceToHaveSection = /nice to have|good to have|bonus|preferred|advantage|plus|helpful/i.test(descriptionText);

    skills.forEach((skill) => {
      const entry = SKILL_DICTIONARY.find((e) => e.label === skill);
      if (entry) {
        // Categorize based on description context if available
        if (isRequiredSection) {
          requiredSkillsMap.set(skill, (requiredSkillsMap.get(skill) || 0) + 1);
        } else if (isNiceToHaveSection) {
          niceToHaveSkillsMap.set(skill, (niceToHaveSkillsMap.get(skill) || 0) + 1);
        } else {
          // Default to required if no context (mentioned in title/description)
          requiredSkillsMap.set(skill, (requiredSkillsMap.get(skill) || 0) + 1);
        }

        // Categorize for breakdown
        if (entry.category === "soft") {
          softSkillsMap.set(skill, (softSkillsMap.get(skill) || 0) + 1);
        } else if (entry.category === "domain") {
          domainMap.set(skill, (domainMap.get(skill) || 0) + 1);
        } else {
          technicalSkillsMap.set(skill, (technicalSkillsMap.get(skill) || 0) + 1);
        }
      }
    });
  });

  const sampleSize = validItems.length;

  const mapToStats = (
    map: Map<string, number>,
    limit = 12,
  ): SkillStat[] => {
    return Array.from(map.entries())
      .map(([skill, count]) => ({
        skill,
        count,
        percentage: Number(((count / sampleSize) * 100).toFixed(1)),
        category: SKILL_DICTIONARY.find((e) => e.label === skill)?.category || "technical",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  };

  const averageSalary =
    salarySamples.length > 0
      ? Number(
          (
            salarySamples.reduce((acc, value) => acc + value, 0) /
            salarySamples.length
          ).toFixed(0),
        )
      : undefined;

  const minSalary =
    salarySamples.length > 0
      ? Number(Math.min(...salarySamples).toFixed(0))
      : undefined;
  const maxSalary =
    salarySamples.length > 0
      ? Number(Math.max(...salarySamples).toFixed(0))
      : undefined;

  const median = (values: number[]): number | undefined => {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      const lower = sorted[mid - 1];
      const upper = sorted[mid];
      if (lower !== undefined && upper !== undefined) {
        return Number(((lower + upper) / 2).toFixed(0));
      }
    }
    return sorted[mid] !== undefined
      ? Number(sorted[mid].toFixed(0))
      : undefined;
  };

  const salary = salarySamples.length
    ? {
        min: minSalary,
        max: maxSalary,
        median: median(salarySamples),
        average: averageSalary,
        currency: "EUR",
        sampleSize: salarySamples.length,
      }
    : undefined;

  const topCompanies = Array.from(companySet).slice(0, 12);

  // Use already-filtered validItems from above
  const sampleListings: JobListingSummary[] = validItems.slice(0, 12).map((item) => {
    // Handle Indeed salary format (string, object, or null)
    let salaryInfo: { min?: number; max?: number; currency?: string } = {};
    if (item.salary === null || item.salary === undefined) {
      salaryInfo = {};
    } else if (typeof item.salary === "string") {
      salaryInfo = parseSalaryFromText(item.salary);
    } else if (typeof item.salary === "object") {
      salaryInfo = {
        min: item.salary.min,
        max: item.salary.max,
        currency: item.salary.currency || "EUR",
      };
    }
    
    return {
      title: item.positionName!, // Already validated above
      company: item.company?.trim() || undefined,
      location: item.location?.trim() || searchLocation,
      salary:
        salaryInfo.min || salaryInfo.max
          ? {
              min: salaryInfo.min,
              max: salaryInfo.max,
              currency: salaryInfo.currency || "EUR",
            }
          : undefined,
      postedAt: item.postedDate || undefined,
      url: item.url!,
    };
  });

  return {
    role: params.role,
    query: params.role,
    country: "fi",
    location: params.location || searchLocation || undefined,
    fetchedAt: new Date().toISOString(),
    sampleSize,
    totalAvailable: sampleSize, // Indeed scraper doesn't provide total count, use sample size
    salary,
    requiredSkills: mapToStats(requiredSkillsMap),
    niceToHaveSkills: mapToStats(niceToHaveSkillsMap, 8), // Fewer nice-to-have for Finnish
    technicalSkills: mapToStats(technicalSkillsMap),
    softSkills: mapToStats(softSkillsMap, 8),
    domainKnowledge: mapToStats(domainMap, 8),
    topCompanies,
    sampleListings,
  };
}

// Generate related search terms based on role
function generateRelatedSearchTerms(role: string): string[] {
  const roleLower = role.toLowerCase();
  const terms: string[] = [role]; // Always include original

  // Extract key terms
  const isSenior = roleLower.includes("senior");
  const isFullStack = roleLower.includes("full stack") || roleLower.includes("fullstack");
  const isFrontend = roleLower.includes("frontend") || roleLower.includes("front-end") || roleLower.includes("front end");
  const isBackend = roleLower.includes("backend") || roleLower.includes("back-end") || roleLower.includes("back end");
  const isEngineer = roleLower.includes("engineer");
  const isDeveloper = roleLower.includes("developer");
  const isDevOps = roleLower.includes("devops") || roleLower.includes("dev ops");
  const isCloud = roleLower.includes("cloud");
  const isData = roleLower.includes("data");

  // Generate related searches
  if (isFullStack) {
    terms.push("Full Stack Developer", "Full Stack Engineer");
    if (isSenior) {
      terms.push("Senior Full Stack Developer", "Senior Full Stack Engineer");
    }
  }
  
  if (isFrontend) {
    terms.push("Frontend Developer", "Frontend Engineer", "React Developer", "Front-end Developer");
  }
  
  if (isBackend) {
    terms.push("Backend Developer", "Backend Engineer", "Node.js Developer", "Back-end Developer");
  }
  
  if (isEngineer && !isFullStack && !isFrontend && !isBackend) {
    terms.push("Software Engineer", "Software Developer");
  }
  
  if (isDevOps) {
    terms.push("DevOps Engineer", "Site Reliability Engineer", "Infrastructure Engineer");
  }
  
  if (isCloud) {
    terms.push("Cloud Engineer", "AWS Engineer", "Azure Engineer", "Cloud Developer");
  }
  
  if (isData) {
    terms.push("Data Engineer", "Data Scientist", "Data Analyst");
  }

  // Remove duplicates and return unique terms
  return Array.from(new Set(terms));
}

// Search Indeed with a specific query
async function searchIndeedJobs(
  client: ApifyClient,
  position: string,
  location: string,
  maxItems: number,
): Promise<IndeedJobItem[]> {
  const input = {
    country: "FI",
    position: position,
    location: location,
    maxItems: maxItems,
    saveOnlyUniqueItems: true,
    followApplyRedirects: false,
    parseCompanyDetails: process.env.APIFY_PARSE_COMPANY_DETAILS === "true",
  };

  const run = await client.actor(APIFY_ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  
  const validItems = (items as IndeedJobItem[]).filter(
    (item) => 
      item.positionName && 
      item.positionName.trim() !== "" && 
      item.positionName !== "Untitled" &&
      item.url // Must have a URL
  );

  const withDescription = validItems.filter(item => item.description && item.description.trim().length > 50).length;
  const withCompany = validItems.filter(item => item.company && item.company.trim().length > 0).length;
  
  console.log(
    `[Finnish Jobs] Search "${position}" in "${location}": ${validItems.length} valid jobs (${withDescription} with descriptions, ${withCompany} with company names)`,
  );

  return validItems;
}

export async function fetchFinnishJobInsights(
  params: FetchAdzunaJobInsightsParams,
): Promise<JobMarketInsights | null> {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    console.warn(
      "[Finnish Jobs] Missing APIFY_API_TOKEN. Skipping Finnish job market insights fetch.",
    );
    return null;
  }

  const client = new ApifyClient({
    token: apiToken.trim().replace(/\s+/g, ""), // Clean token
  });

  // Try city first, then country
  const location = params.location || "Helsinki"; // Default to Helsinki instead of Finland
  const fallbackLocation = params.location === "Finland" ? "Helsinki" : "Finland";
  
  try {
    console.log(
      `[Finnish Jobs] Fetching jobs for "${params.role}" in "${location}" from Indeed`,
    );

    // Generate related search terms
    const searchTerms = generateRelatedSearchTerms(params.role);
    console.log(
      `[Finnish Jobs] Will search for: ${searchTerms.slice(0, 5).join(", ")}${searchTerms.length > 5 ? "..." : ""}`,
    );

    // Try primary search
    let allJobs: IndeedJobItem[] = await searchIndeedJobs(
      client,
      params.role,
      location,
      APIFY_MAX_ITEMS,
    );

    console.log(
      `[Finnish Jobs] Primary search found ${allJobs.length} valid jobs for "${params.role}" in "${location}"`,
    );

    // If we got few results, try related searches IN PARALLEL (much faster!)
    if (allJobs.length < 10 && searchTerms.length > 1) {
      console.log(
        `[Finnish Jobs] Low results (${allJobs.length}), trying related positions in parallel...`,
      );
      
      const jobUrls = new Set(allJobs.map(job => job.url).filter(Boolean));
      
      // Try up to 3 related terms in parallel (skip first one as it's the original)
      const relatedSearches = searchTerms.slice(1, 4).map(term => 
        searchIndeedJobs(
          client,
          term,
          location,
          Math.min(20, APIFY_MAX_ITEMS - allJobs.length), // Limit per search
        ).catch((error) => {
          console.warn(
            `[Finnish Jobs] Error searching for "${term}":`,
            error instanceof Error ? error.message : String(error),
          );
          return [] as IndeedJobItem[]; // Return empty array on error
        })
      );

      // Wait for all related searches to complete in parallel
      const relatedResults = await Promise.all(relatedSearches);
      
      for (const relatedJobs of relatedResults) {
        const newJobs = relatedJobs.filter(
          job => job.url && !jobUrls.has(job.url)
        );
        
        newJobs.forEach(job => jobUrls.add(job.url!));
        allJobs = [...allJobs, ...newJobs];
        
        if (newJobs.length > 0) {
          console.log(
            `[Finnish Jobs] Related search added ${newJobs.length} new jobs (total: ${allJobs.length})`,
          );
        }
        
        if (allJobs.length >= APIFY_MAX_ITEMS) break;
      }
    }

    // If still low results and location was city, try country-wide
    if (allJobs.length < 10 && location !== fallbackLocation) {
      console.log(
        `[Finnish Jobs] Still low results (${allJobs.length}), trying country-wide search...`,
      );
      
      const jobUrls = new Set(allJobs.map(job => job.url).filter(Boolean));
      
      try {
        const countryJobs = await searchIndeedJobs(
          client,
          params.role,
          fallbackLocation,
          Math.min(30, APIFY_MAX_ITEMS - allJobs.length),
        );
        
        const newJobs = countryJobs.filter(
          job => job.url && !jobUrls.has(job.url)
        );
        
        allJobs = [...allJobs, ...newJobs];
        
        console.log(
          `[Finnish Jobs] Country-wide search added ${newJobs.length} new jobs (total: ${allJobs.length})`,
        );
      } catch (error) {
        console.warn(
          `[Finnish Jobs] Error in country-wide search:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const withDescription = allJobs.filter(item => item.description && item.description.trim().length > 50).length;
    const withCompany = allJobs.filter(item => item.company && item.company.trim().length > 0).length;
    
    console.log(
      `[Finnish Jobs] Final results: ${allJobs.length} jobs (${withDescription} with descriptions, ${withCompany} with company names)`,
    );

    if (allJobs.length === 0) {
      console.warn(
        `[Finnish Jobs] No valid job postings found for "${params.role}" in "${location}" (tried ${searchTerms.length} search terms)`,
      );
      return null;
    }

    console.log(
      `[Finnish Jobs] Total valid jobs found: ${allJobs.length} (from ${searchTerms.length} search terms)`,
    );

    // Use the effective location (where we found most jobs)
    const effectiveLocation = allJobs.length > 0 ? location : fallbackLocation;
    return analyzeIndeedJobPostings(params, allJobs, effectiveLocation);
  } catch (error: any) {
    console.error(
      "[Finnish Jobs] Failed to fetch job market insights:",
      error?.message || error,
    );
    return null;
  }
}

