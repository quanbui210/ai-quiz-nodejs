/**
 * Tavily Web Search Service
 * 
 * Integrates with Tavily API to search for up-to-date learning resources
 * (courses, tutorials, documentation) for skill mastery roadmaps.
 * 
 * Usage:
 * - Search for courses: searchCourses("AWS Lambda", { year: 2024 })
 * - Search for tutorials: searchTutorials("Python", { difficulty: "beginner" })
 * - Search for documentation: searchDocumentation("React", { version: "latest" })
 */

import axios from "axios";

interface TavilySearchOptions {
  maxResults?: number;
  includeDomains?: string[];
  year?: number;
  difficulty?: "beginner" | "intermediate" | "advanced";
  version?: string;
}

interface TavilySearchResult {
  title: string;
  url: string;
  description?: string;
  publishedDate?: string;
  score?: number;
}

interface TavilyApiResponse {
  query: string;
  response_time: number;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
    raw_content?: string;
  }>;
}

const TAVILY_API_URL = "https://api.tavily.com/search";

async function tavilySearch(
  query: string,
  options: {
    maxResults?: number;
    includeDomains?: string[];
    searchDepth?: "basic" | "advanced";
  } = {},
): Promise<TavilySearchResult[]> {
  if (!process.env.TAVILY_API_KEY) {
    console.warn("[Tavily] API key not configured");
    return [];
  }

  try {
    const response = await axios.post<TavilyApiResponse>(
      TAVILY_API_URL,
      {
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: options.searchDepth || "basic",
        max_results: options.maxResults || 10,
        include_domains: options.includeDomains || undefined,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.results.map((result) => ({
      title: result.title,
      url: result.url,
      description: result.content?.substring(0, 300) || undefined,
      publishedDate: result.published_date,
      score: result.score,
    }));
  } catch (error: any) {
    console.error("[Tavily] Search error:", error.response?.data || error.message);
    return [];
  }
}

/**
 * Search for courses related to a skill
 * @param skillName - The skill to search for (e.g., "AWS Lambda", "Python")
 * @param options - Search options
 * @returns Array of course search results
 */
export async function searchCourses(
  skillName: string,
  options: TavilySearchOptions = {},
): Promise<TavilySearchResult[]> {
  const currentYear = options.year || new Date().getFullYear();
  const query = `best ${skillName} course ${currentYear} online learning`;

  const results = await tavilySearch(query, {
    maxResults: options.maxResults || 10,
    includeDomains: options.includeDomains || [
      "udemy.com",
      "coursera.org",
      "pluralsight.com",
      "freecodecamp.org",
      "edx.org",
      "khanacademy.org",
    ],
    searchDepth: "basic",
  });

  return results;
}

/**
 * Search for tutorials related to a skill
 * @param skillName - The skill to search for
 * @param options - Search options
 * @returns Array of tutorial search results
 */
export async function searchTutorials(
  skillName: string,
  options: TavilySearchOptions = {},
): Promise<TavilySearchResult[]> {
  const difficulty = options.difficulty || "beginner";
  const query = `${skillName} tutorial ${difficulty} step by step guide`;

  const results = await tavilySearch(query, {
    maxResults: options.maxResults || 8,
    includeDomains: options.includeDomains || [
      "youtube.com",
      "freecodecamp.org",
      "medium.com",
      "dev.to",
      "tutorialspoint.com",
      "w3schools.com",
    ],
    searchDepth: "basic",
  });

  return results;
}

/**
 * Search for official documentation
 * @param skillName - The skill to search for
 * @param options - Search options
 * @returns Array of documentation search results
 */
export async function searchDocumentation(
  skillName: string,
  options: TavilySearchOptions = {},
): Promise<TavilySearchResult[]> {
  const query = `${skillName} official documentation ${options.version || "latest"}`;

  const results = await tavilySearch(query, {
    maxResults: options.maxResults || 5,
    includeDomains: options.includeDomains || [
      "docs.python.org",
      "docs.aws.amazon.com",
      "react.dev",
      "nodejs.org",
      "developer.mozilla.org",
      "docs.microsoft.com",
    ],
    searchDepth: "basic",
  });

  return results;
}

/**
 * Search for certification resources
 * @param skillName - The skill to search for
 * @param options - Search options
 * @returns Array of certification search results
 */
export async function searchCertifications(
  skillName: string,
  options: TavilySearchOptions = {},
): Promise<TavilySearchResult[]> {
  const currentYear = options.year || new Date().getFullYear();
  const query = `${skillName} certification ${currentYear} exam preparation study guide`;

  const results = await tavilySearch(query, {
    maxResults: options.maxResults || 8,
    includeDomains: options.includeDomains || [
      "aws.amazon.com",
      "microsoft.com",
      "google.com",
      "coursera.org",
      "udemy.com",
      "pluralsight.com",
    ],
    searchDepth: "basic",
  });

  return results;
}

/**
 * Validate and verify a resource URL is still active
 * @param url - The URL to verify
 * @returns true if URL is active, false otherwise
 */
export async function verifyResourceUrl(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: (status) => status < 500, // Accept 2xx, 3xx, 4xx
    });
    return response.status < 400; // 2xx or 3xx = active
  } catch (error) {
    console.warn(`[Tavily] URL verification failed for ${url}:`, error);
    return false;
  }
}

