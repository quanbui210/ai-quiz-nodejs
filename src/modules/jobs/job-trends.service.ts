import prisma from "../../utils/prisma";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";

const DEFAULT_MODEL =
  process.env.OPENAI_CAREER_MODEL ||
  process.env.OPENAI_DEFAULT_MODEL ||
  "gpt-4o-mini";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

interface MarketTrendsData {
  totalJobs: number;
  averageExperience: number | null;
  topMustHaveSkills: Record<string, number>;
  topNiceToHaveSkills: Record<string, number>;
  salaryStats: {
    min: number | null;
    max: number | null;
    median: number | null;
    average: number | null;
    currency?: string;
  };
  companyStats: Record<string, number>;
  roleDistribution: Record<string, number>;
}

interface MarketTrendsAnalysis {
  summary: string; // 2-3 sentence overview
  trendOverview: string; // 3-5 sentences or bullet points about current market trends
  demandLevel: "HIGH" | "MEDIUM" | "LOW";
  growthTrend: "GROWING" | "STABLE" | "DECLINING";
  keyInsights: string[]; // 3-5 key insights (bullet points)
  skillTrends: {
    emerging: Array<{ skill: string; trend: string; recommendation: string }>;
    declining: Array<{ skill: string; trend: string; note: string }>;
    stable: Array<{ skill: string; note: string }>;
  };
  marketRecommendations: string[]; // 3-5 actionable recommendations
  salaryInsights: {
    marketPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";
    factors: string[];
    negotiationTips: string[];
  };
  companyInsights?: {
    topEmployers: string[];
    hiringTrends: string;
  };
}

/**
 * Calculate market trends from all processed jobs
 */
export async function calculateMarketTrends(
  country: string = "fi",
  location?: string,
  role?: string,
): Promise<MarketTrendsData> {
  const whereClause: any = {
    country: country.toLowerCase(),
    isProcessed: true,
    analysis: {
      isNot: null,
    },
  };

  if (location) {
    whereClause.location = {
      contains: location,
      mode: "insensitive",
    };
  }

  if (role) {
    whereClause.role = {
      contains: role,
      mode: "insensitive",
    };
  }

  // Get all processed jobs with analysis
  // @ts-ignore - Prisma client will be regenerated after schema migration
  const jobs = await (prisma as any).job.findMany({
    where: whereClause,
    include: {
      analysis: true,
    },
  });

  if (jobs.length === 0) {
    return {
      totalJobs: 0,
      averageExperience: null,
      topMustHaveSkills: {},
      topNiceToHaveSkills: {},
      salaryStats: {
        min: null,
        max: null,
        median: null,
        average: null,
      },
      companyStats: {},
      roleDistribution: {},
    };
  }

  // Aggregate skills
  const mustHaveSkillsMap = new Map<string, number>();
  const niceToHaveSkillsMap = new Map<string, number>();
  const companyMap = new Map<string, number>();
  const roleMap = new Map<string, number>();
  const experienceYears: number[] = [];
  const salaries: number[] = [];

  for (const job of jobs) {
    if (!job.analysis) continue;

    // Count must-have skills
    for (const skill of job.analysis.mustHaveSkills) {
      mustHaveSkillsMap.set(skill, (mustHaveSkillsMap.get(skill) || 0) + 1);
    }

    // Count nice-to-have skills
    for (const skill of job.analysis.niceToHaveSkills) {
      niceToHaveSkillsMap.set(skill, (niceToHaveSkillsMap.get(skill) || 0) + 1);
    }

    // Count companies
    if (job.company) {
      companyMap.set(job.company, (companyMap.get(job.company) || 0) + 1);
    }

    // Count roles
    if (job.role) {
      roleMap.set(job.role, (roleMap.get(job.role) || 0) + 1);
    }

    // Collect experience years
    if (job.analysis.experienceYears) {
      experienceYears.push(job.analysis.experienceYears);
    }

    // Collect salaries
    if (job.salaryMin) {
      salaries.push(job.salaryMin);
    }
    if (job.salaryMax) {
      salaries.push(job.salaryMax);
    }
  }


  const totalJobsWithSkills = jobs.filter((j: any) => j.analysis && j.analysis.mustHaveSkills.length > 0).length;
  const topMustHaveSkillsArray = Array.from(mustHaveSkillsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([skill, count]) => ({
      skill,
      count,
      percentage: totalJobsWithSkills > 0 ? Math.round((count / totalJobsWithSkills) * 100) : 0,
    }));

  const topNiceToHaveSkillsArray = Array.from(niceToHaveSkillsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([skill, count]) => ({
      skill,
      count,
      percentage: jobs.length > 0 ? Math.round((count / jobs.length) * 100) : 0,
    }));

  // Convert to object format for backward compatibility
  const topMustHaveSkills = Object.fromEntries(
    topMustHaveSkillsArray.map(item => [item.skill, item.count])
  );

  const topNiceToHaveSkills = Object.fromEntries(
    topNiceToHaveSkillsArray.map(item => [item.skill, item.count])
  );

  // Calculate average experience
  const averageExperience =
    experienceYears.length > 0
      ? experienceYears.reduce((a, b) => a + b, 0) / experienceYears.length
      : null;

  // Calculate salary stats
  const salaryStats = {
    min: salaries.length > 0 ? Math.min(...salaries) : null,
    max: salaries.length > 0 ? Math.max(...salaries) : null,
    median: calculateMedian(salaries),
    average:
      salaries.length > 0
        ? salaries.reduce((a, b) => a + b, 0) / salaries.length
        : null,
  };

  // Top companies (top 10)
  const companyStats = Object.fromEntries(
    Array.from(companyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  );

  // Role distribution
  const roleDistribution = Object.fromEntries(roleMap.entries());

  return {
    totalJobs: jobs.length,
    averageExperience: averageExperience ? Math.round(averageExperience * 10) / 10 : null,
    topMustHaveSkills,
    topNiceToHaveSkills,
    salaryStats: {
      ...salaryStats,
      currency: "EUR", // Default to EUR for Finland
    },
    companyStats,
    roleDistribution,
  };
}

/**
 * Calculate median
 */
function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2;
  }
  
  return sorted[mid] || 0;
}

/**
 * Generate AI analysis of market trends
 */
export async function analyzeMarketTrendsWithAI(
  trends: MarketTrendsData,
  country: string,
  location?: string,
  role?: string,
): Promise<MarketTrendsAnalysis> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const context = {
    country,
    location: location || "all locations",
    role: role || "all roles",
    totalJobs: trends.totalJobs,
    averageExperience: trends.averageExperience,
    topMustHaveSkills: Object.entries(trends.topMustHaveSkills)
      .slice(0, 15)
      .map(([skill, count]) => ({ skill, count, percentage: Math.round((count / trends.totalJobs) * 100) })),
    topNiceToHaveSkills: Object.entries(trends.topNiceToHaveSkills)
      .slice(0, 15)
      .map(([skill, count]) => ({ skill, count, percentage: Math.round((count / trends.totalJobs) * 100) })),
    salaryStats: trends.salaryStats,
    topCompanies: Object.entries(trends.companyStats)
      .slice(0, 10)
      .map(([company, count]) => ({ company, jobCount: count })),
    roleDistribution: Object.entries(trends.roleDistribution)
      .slice(0, 10)
      .map(([role, count]) => ({ role, count })),
  };

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.6,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert career market analyst with deep knowledge of technology industry trends, economic indicators, and labor market dynamics. Analyze aggregated job market data and provide strategic insights that help professionals understand market trends, skill demands, and career opportunities.

Your task is to analyze the provided market statistics and generate:
1. Market overview and demand assessment
2. Skill trend analysis (emerging, declining, stable)
3. Salary insights and negotiation tips
4. Actionable market recommendations
5. Company and hiring insights

CRITICAL RULES:
- Base ALL insights on the provided data (percentages, counts, salary ranges)
- **IMPORTANT: Use your internal knowledge about the current economic situation in Finland (as of your knowledge cutoff)**
- **Consider broader economic context**: Finland's economy has been facing challenges, with slower growth, high inflation, and a more competitive job market. Finding tech jobs may be more difficult than in previous years.
- **Provide realistic market assessment**: If there are only a few jobs (e.g., <50), note that the market is competitive and finding positions may be challenging. Be honest about market conditions.
- Combine data with your domain knowledge of industry trends and economic conditions
- Be specific and actionable in recommendations
- Identify emerging skills (growing in demand) vs declining skills
- Provide realistic salary insights based on the data AND current economic conditions
- Keep insights general (not personalized) - this is for all users
- Use actual numbers from the data when making claims
- Consider regional context (Finland for "fi" country code)
- **Market Reality Check**: If total jobs are low , emphasize that the market is competitive and candidates should be prepared for a longer job search, focus on skill development, and consider expanding their search criteria

Return JSON with this EXACT structure:
{
  "summary": "2-3 sentence overview of the job market, including demand level, key characteristics, AND realistic assessment of job search difficulty based on both the data AND current economic conditions in Finland. Be honest about market competitiveness.",
  "trendOverview": "3-5 sentences or bullet points describing current market trends. Focus on: job availability (many jobs = good market, few jobs = challenging), skill demand patterns, salary trends, overall market health, AND the broader economic context in Finland. Use actual numbers from the data (e.g., 'With X jobs posted in the past 14 days...'). Include realistic assessment of job search difficulty - if jobs are few, note that the market is competitive and finding positions may take longer. Format as paragraphs or bullet points.",
  "demandLevel": "HIGH" | "MEDIUM" | "LOW",
  "growthTrend": "GROWING" | "STABLE" | "DECLINING",
  "keyInsights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"], // 3-5 key market insights (bullet points)
  "skillTrends": {
    "emerging": [
      {"skill": "skill name", "trend": "why it's emerging", "recommendation": "why to learn it"}
    ], // 3-5 emerging skills
    "declining": [
      {"skill": "skill name", "trend": "why it's declining", "note": "context"}
    ], // 2-3 declining skills (if any)
    "stable": [
      {"skill": "skill name", "note": "why it remains important"}
    ] // 3-5 stable/core skills
  },
  "marketRecommendations": ["recommendation 1", "recommendation 2", "recommendation 3"], // 3-5 actionable recommendations
  "salaryInsights": {
    "marketPosition": "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN",
    "factors": ["factor 1", "factor 2"], // factors affecting salary
    "negotiationTips": ["tip 1", "tip 2", "tip 3"] // 3-5 negotiation tips
  },
  "companyInsights": {
    "topEmployers": ["company 1", "company 2", "company 3"], // from data
    "hiringTrends": "brief description of hiring patterns"
  }
}

Respond ONLY with valid JSON, no markdown, no code blocks.`,
      },
      {
        role: "user",
        content: `Analyze this job market data for ${context.role} in ${context.location}, ${context.country}:

**IMPORTANT CONTEXT:**
- Consider the current economic situation in Finland (as of your knowledge cutoff)
- Finland's economy has been facing challenges: slower growth, and a more competitive job market
- Tech job market is more challenging than in previous years
- Be realistic about job search difficulty - if there are few jobs (e.g., <30), note that competition is high and finding positions may take longer

**JOB MARKET DATA:**
Total Jobs: ${context.totalJobs}
Average Experience Required: ${context.averageExperience ? `${context.averageExperience} years` : "Not specified"}

Top Must-Have Skills:
${context.topMustHaveSkills.map(s => `- ${s.skill}: ${s.count} jobs (${s.percentage}%)`).join("\n")}

Top Nice-to-Have Skills:
${context.topNiceToHaveSkills.map(s => `- ${s.skill}: ${s.count} jobs (${s.percentage}%)`).join("\n")}

Salary Statistics:
- Min: ${context.salaryStats.min ? `${context.salaryStats.min} ${context.salaryStats.currency || "EUR"}` : "Not available"}
- Max: ${context.salaryStats.max ? `${context.salaryStats.max} ${context.salaryStats.currency || "EUR"}` : "Not available"}
- Median: ${context.salaryStats.median ? `${context.salaryStats.median} ${context.salaryStats.currency || "EUR"}` : "Not available"}
- Average: ${context.salaryStats.average ? `${context.salaryStats.average} ${context.salaryStats.currency || "EUR"}` : "Not available"}

Top Companies Hiring:
${context.topCompanies.map(c => `- ${c.company}: ${c.jobCount} jobs`).join("\n")}

Role Distribution:
${context.roleDistribution.map(r => `- ${r.role}: ${r.count} jobs`).join("\n")}

Generate comprehensive market analysis with insights, trends, and recommendations.`,
      },
    ],
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error("No response from OpenAI");
  }

  try {
    const analysis = JSON.parse(response) as MarketTrendsAnalysis;
    return analysis;
  } catch (error) {
    console.error("[Market Trends AI] Failed to parse AI response:", error);
    throw new Error("Failed to parse AI analysis response");
  }
}

export async function storeMarketTrends(
  country: string = "fi",
  location?: string,
  role?: string,
): Promise<void> {
  const trends = await calculateMarketTrends(country, location, role);

  // Generate AI analysis ONCE (only if we have jobs)
  let aiAnalysis: MarketTrendsAnalysis | null = null;
  if (trends.totalJobs > 0) {
    try {
      aiAnalysis = await analyzeMarketTrendsWithAI(trends, country, location, role);
      console.log(`[Market Trends] Generated AI analysis for ${role || "all roles"} in ${location || "all locations"}`);
    } catch (error) {
      console.error("[Market Trends] Failed to generate AI analysis:", error);
    }
  }

  const periodStart = new Date();
  periodStart.setDate(1); 
  const periodEnd = new Date();

  await prisma.$executeRaw`
    INSERT INTO "MarketTrends" (
      "id", "country", "location", "role", "periodStart", "periodEnd",
      "totalJobs", "averageExperience", "topMustHaveSkills", "topNiceToHaveSkills",
      "salaryStats", "companyStats", "roleDistribution", "calculatedAt", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid(),
      ${country}::text,
      ${location || null}::text,
      ${role || null}::text,
      ${periodStart}::timestamp,
      ${periodEnd}::timestamp,
      ${trends.totalJobs}::integer,
      ${trends.averageExperience ?? null}::float,
      ${JSON.stringify(trends.topMustHaveSkills)}::jsonb,
      ${JSON.stringify(trends.topNiceToHaveSkills)}::jsonb,
      ${JSON.stringify({ ...trends.salaryStats, _aiAnalysis: aiAnalysis })}::jsonb,
      ${JSON.stringify(trends.companyStats)}::jsonb,
      ${JSON.stringify(trends.roleDistribution)}::jsonb,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT ("country", "location", "role", "periodStart")
    DO UPDATE SET
      "periodEnd" = EXCLUDED."periodEnd",
      "totalJobs" = EXCLUDED."totalJobs",
      "averageExperience" = EXCLUDED."averageExperience",
      "topMustHaveSkills" = EXCLUDED."topMustHaveSkills",
      "topNiceToHaveSkills" = EXCLUDED."topNiceToHaveSkills",
      "salaryStats" = EXCLUDED."salaryStats",
      "companyStats" = EXCLUDED."companyStats",
      "roleDistribution" = EXCLUDED."roleDistribution",
      "calculatedAt" = NOW(),
      "updatedAt" = NOW()
  `;
}

