import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import type { JobMarketInsights } from "./finnish-jobs.service";

const DEFAULT_CAREER_MODEL =
  process.env.OPENAI_CAREER_MODEL ||
  process.env.OPENAI_DEFAULT_MODEL ||
  "gpt-4o-mini";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

export interface JobMarketAnalysis {
  marketTrends: {
    summary: string;
    demandLevel: "HIGH" | "MEDIUM" | "LOW";
    growthTrend: "GROWING" | "STABLE" | "DECLINING";
    competitionLevel: "HIGH" | "MEDIUM" | "LOW";
    economicOutlook?: string; // Industry economic outlook and growth sectors
    industryTrends?: string[]; // Industry-wide trends affecting this role
    insights: string[];
  };
  skillAnalysis: {
    criticalSkills: Array<{
      skill: string;
      importance: "CRITICAL" | "IMPORTANT" | "NICE_TO_HAVE";
      marketFrequency: number; // percentage
      recommendation: string;
    }>;
    emergingSkills: Array<{
      skill: string;
      trend: string;
      recommendation: string;
    }>;
    skillGaps?: Array<{
      skill: string;
      gap: "MISSING" | "WEAK";
      priority: "HIGH" | "MEDIUM" | "LOW";
      recommendation: string;
    }>;
  };
  salaryInsights: {
    marketPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";
    negotiationTips: string[];
    factors: string[];
  };
  careerRecommendations: {
    immediateActions: string[];
    learningPriorities: string[];
    marketAlignment: string[];
  };
  companyInsights?: {
    topEmployers: string[];
    companyTypes: string[]; // e.g., "Tech Startups", "Enterprise", "Consulting"
    hiringTrends: string;
  };
}

export interface AnalyzeJobMarketInput {
  jobMarketData: JobMarketInsights;
  isGeneral?: boolean; 
}

export async function analyzeJobMarketWithAI(
  input: AnalyzeJobMarketInput,
): Promise<JobMarketAnalysis> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const { jobMarketData } = input;

  const dataSummary = {
    role: jobMarketData.role,
    location: jobMarketData.location || jobMarketData.country,
    totalJobs: jobMarketData.totalAvailable,
    sampleSize: jobMarketData.sampleSize,
    salary: jobMarketData.salary,
    requiredSkills: jobMarketData.requiredSkills.map((s) => ({
      skill: s.skill,
      frequency: s.percentage,
      category: s.category, // "technical", "soft", "domain", "process"
    })),
    niceToHaveSkills: jobMarketData.niceToHaveSkills.map((s) => ({
      skill: s.skill,
      frequency: s.percentage,
      category: s.category, // "technical", "soft", "domain", "process"
    })),
    technicalSkills: jobMarketData.technicalSkills.map((s) => ({
      skill: s.skill,
      frequency: s.percentage,
    })),
    softSkills: jobMarketData.softSkills.map((s) => ({
      skill: s.skill,
      frequency: s.percentage,
    })),
    topCompanies: jobMarketData.topCompanies,
    sampleListings: jobMarketData.sampleListings.slice(0, 5).map((l) => ({
      title: l.title,
      company: l.company,
      location: l.location,
      salary: l.salary,
    })),
  };

  // Generate general market insights for all users (not personalized)
  const userContext = "Generate general market insights for all users. Do not include personalized skill gaps or user-specific recommendations.";

  const completion = await openai.chat.completions.create({
    model: DEFAULT_CAREER_MODEL,
    temperature: 0.5,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert career market analyst and recruiter with deep knowledge of technology industry trends, economic indicators, and labor market dynamics. Analyze real job market data from Indeed and combine it with your knowledge of industry trends, economic outlook, and technology adoption patterns to provide comprehensive strategic insights.

ROLE-AWARE SKILL PRIORITIZATION:
- First, determine if the role is MANAGEMENT-ORIENTED (e.g., Lead, Manager, Director, CTO, VP, Head of, PM, PO, Product Manager, Engineering Manager, Team Lead, etc.)
- For TECHNICAL ROLES (Developer, Engineer, Analyst, etc. - NOT management):
  * Prioritize TECHNICAL SKILLS as "CRITICAL" even if soft skills appear more frequently
  * Soft skills like "Leadership", "Management", "Team Building" should be "IMPORTANT" or "NICE_TO_HAVE" even if they appear in 80%+ of postings
  * Technical skills (programming languages, frameworks, tools) should be "CRITICAL" if they appear frequently
- For MANAGEMENT ROLES:
  * Leadership and management skills can be "CRITICAL"
  * Technical skills are still important but may be "IMPORTANT" rather than "CRITICAL"

COMBINE MARKET DATA WITH DOMAIN KNOWLEDGE:
- Use the provided job market data as the PRIMARY source for skill frequencies and trends
- BUT ALSO use your domain knowledge to identify FUNDAMENTAL/INDUSTRY-STANDARD skills for the role
- For example:
  * DevOps Engineer: Linux, CI/CD, Docker, Kubernetes, Cloud platforms (AWS/Azure/GCP), Infrastructure as Code are fundamental even if not in the data
  * Frontend Developer: HTML, CSS, JavaScript, React/Vue/Angular are fundamental
  * Backend Developer: API design, databases, server-side languages are fundamental
  * Data Engineer: SQL, Python, data pipelines, ETL are fundamental
- Include these fundamental skills as "CRITICAL" even if they don't appear in the market data (they're so basic they're assumed)
- Mark them with marketFrequency: 0 or note "Industry standard" in the recommendation
- Prioritize: Market data skills (with frequencies) > Domain knowledge fundamentals (if missing from data)

SKILL CATEGORIZATION RULES:
- "CRITICAL": 
  * Must-have skills that are essential for the role (technical skills for technical roles, leadership for management roles)
  * Industry-standard/fundamental skills for the role (even if not in market data - use your domain knowledge)
  * Skills that appear frequently in market data AND are relevant to the role
- "IMPORTANT": Valuable skills that enhance performance but aren't strictly required
- "NICE_TO_HAVE": Beneficial skills that provide an edge but aren't necessary

Your task is to analyze the provided job market data and combine it with your knowledge of:
- Industry economic outlook and growth trends
- Technology adoption patterns and stack popularity (e.g., Stack Overflow Developer Survey, GitHub State of Software)
- Regional economic indicators and labor market conditions
- Industry reports and surveys (Gartner, Forrester, etc.)
- Remote work trends and geographic salary variations
- Skill demand evolution (what's growing, what's declining)
- Market competition levels and hiring patterns

Generate comprehensive insights:
1. Market trends and demand analysis (with economic context)
2. Skill analysis with priorities (role-aware, including industry trends)
3. Salary insights and negotiation tips (with regional/economic context)
4. Career recommendations (considering industry outlook)
5. Company/employer insights (with industry context)

Return your analysis as JSON with this EXACT structure:
{
  "marketTrends": {
    "summary": "2-3 sentence overview of the job market for this role/location, including economic context",
    "demandLevel": "HIGH" | "MEDIUM" | "LOW",
    "growthTrend": "GROWING" | "STABLE" | "DECLINING",
    "competitionLevel": "HIGH" | "MEDIUM" | "LOW",
    "economicOutlook": "Brief analysis of industry economic outlook, growth sectors, and potential risks",
    "industryTrends": ["trend 1", "trend 2", "trend 3"], // Industry-wide trends affecting this role
    "insights": ["insight 1", "insight 2", "insight 3"] // 3-5 key market insights combining job data + industry knowledge
  },
  "skillAnalysis": {
    "criticalSkills": [
      {
        "skill": "skill name",
        "importance": "CRITICAL" | "IMPORTANT" | "NICE_TO_HAVE",
        "marketFrequency": number, // percentage from data
        "recommendation": "why this skill matters and how to prioritize it"
      }
    ], // Top 8-10 most critical skills
    "emergingSkills": [
      {
        "skill": "skill name",
        "trend": "brief trend description",
        "recommendation": "why to learn this now"
      }
    ], // 3-5 emerging skills
    "skillGaps": [] // Not included in general insights - use Roadmap feature for personalized skill gaps
  },
  "salaryInsights": {
    "marketPosition": "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN",
    "negotiationTips": ["tip 1", "tip 2", "tip 3"], // 3-5 actionable tips
    "factors": ["factor 1", "factor 2"] // factors affecting salary in this market
  },
  "careerRecommendations": {
    "immediateActions": ["action 1", "action 2", "action 3"], // 3-5 immediate steps
    "learningPriorities": ["priority 1", "priority 2", "priority 3"], // Top learning priorities
    "marketAlignment": ["alignment tip 1", "alignment tip 2"] // How to align with market demands
  },
  "companyInsights": {
    "topEmployers": ["company 1", "company 2", "company 3"], // From data
    "companyTypes": ["type 1", "type 2"], // e.g., "Tech Startups", "Enterprise"
    "hiringTrends": "brief description of hiring patterns"
  }
}

CRITICAL RULES:
- Base analysis on BOTH: (1) provided market data AND (2) your domain knowledge of the role AND (3) industry economic outlook and trends
- Use actual percentages and frequencies from the data when available
- ENRICH with industry knowledge: Reference known industry trends, economic indicators, technology adoption patterns, and labor market dynamics
- For skills NOT in the data but fundamental to the role (use domain knowledge), set marketFrequency: 0 and note "Industry standard" in recommendation
- DETERMINE ROLE TYPE FIRST: Check if role title contains management keywords (Lead, Manager, Director, CTO, VP, Head, PM, PO, etc.)
- For TECHNICAL ROLES: Prioritize technical skills as "CRITICAL", soft skills as "IMPORTANT" or "NICE_TO_HAVE" even if frequent
- For MANAGEMENT ROLES: Leadership/management skills can be "CRITICAL", technical skills are "IMPORTANT"
- Include fundamental/industry-standard skills for the role even if missing from market data (e.g., Linux for DevOps, HTML/CSS for Frontend)
- ECONOMIC CONTEXT: Consider industry growth trends, recession indicators, remote work adoption, geographic salary variations
- TECHNOLOGY TRENDS: Reference known tech stack popularity (e.g., React dominance, Python growth in AI/ML, Kubernetes adoption)
- If currentPosition/currentSkills provided, identify specific skill gaps
- Be specific and actionable in recommendations
- Market trends should reflect the actual job count and sample size, BUT enrich with industry context
- Salary insights should reference the actual salary data provided AND consider regional economic factors
- Company insights should use the actual companies from the data AND reference industry patterns
- Keep all recommendations practical and achievable
- Separate technical skills from soft skills in your analysis

Respond ONLY with valid JSON, no markdown, no code blocks.`,
      },
      {
        role: "user",
        content: `Analyze this job market data:

Role: ${dataSummary.role}
Location: ${dataSummary.location}
Total Jobs Available: ${dataSummary.totalJobs}
Sample Size Analyzed: ${dataSummary.sampleSize}

IMPORTANT: Analyze if "${dataSummary.role}" is a MANAGEMENT role (contains: Lead, Manager, Director, CTO, VP, Head, PM, PO, Product Manager, Engineering Manager, Team Lead, etc.) or a TECHNICAL role (Developer, Engineer, Analyst, etc.). Adjust skill prioritization accordingly.

Salary Data:
${dataSummary.salary ? JSON.stringify(dataSummary.salary, null, 2) : "No salary data available"}

Required Skills (Top 10) - with categories:
${JSON.stringify(dataSummary.requiredSkills.slice(0, 10), null, 2)}

Nice-to-Have Skills (Top 5) - with categories:
${JSON.stringify(dataSummary.niceToHaveSkills.slice(0, 5), null, 2)}

Technical Skills Breakdown (Top 10):
${JSON.stringify(dataSummary.technicalSkills.slice(0, 10), null, 2)}

Soft Skills Breakdown (Top 10):
${JSON.stringify(dataSummary.softSkills.slice(0, 10), null, 2)}

Top Companies:
${dataSummary.topCompanies.join(", ")}

Sample Job Listings:
${JSON.stringify(dataSummary.sampleListings, null, 2)}

User Context:
${userContext}

Provide a comprehensive market analysis with actionable insights.`,
      },
    ],
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) {
    throw new Error("AI analysis returned empty response");
  }

  try {
    const analysis = JSON.parse(responseText) as JobMarketAnalysis;
    return analysis;
  } catch (error) {
    console.error("Failed to parse AI analysis JSON:", error);
    console.error("Raw response:", responseText);
    throw new Error("Failed to parse AI analysis response");
  }
}

