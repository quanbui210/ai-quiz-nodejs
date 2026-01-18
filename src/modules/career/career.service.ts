import OpenAI from "openai";
import {
  Difficulty,
  ResourceType,
  TaskType,
  Timeframe,
} from "@prisma/client";

import { observeOpenAI } from "@langfuse/openai";
import { trace } from "@opentelemetry/api";
import type { JobMarketInsights } from "../market/finnish-jobs.service";
import {
  searchCourses,
  searchTutorials,
  searchDocumentation,
  searchCertifications,
} from "../../utils/tavily-search.service";

const DEFAULT_CAREER_MODEL =
  process.env.OPENAI_CAREER_MODEL ||
  process.env.OPENAI_DEFAULT_MODEL ||
  "gpt-4o-mini";

const openai = observeOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}));

const safeJsonParse = <T>(value?: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn("Failed to parse AI JSON payload:", error);
    return null;
  }
};

export interface SkillGapAnalysisInput {
  currentRole: string;
  targetRole: string;
  currentSkills: string[];
  timeframe: Timeframe;
  resumeText?: string | null;
}

export interface SkillGapAnalysis {
  requiredSkills: string[]; 
  userHasSkills: string[]; 
  missingSkills: string[]; 
  skillGapAnalysis: Array<{
    skill: string; // Skill name
    status: "HAS" | "MISSING";
    priority: "HIGH" | "MEDIUM" | "LOW";
    reason?: string; 
  }>;
}

export const generateSkillGapAnalysis = async (
  input: SkillGapAnalysisInput,
): Promise<SkillGapAnalysis> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const tracer = trace.getTracer("career-service");
  const span = tracer.startSpan("generateSkillGapAnalysis");

  try {
    const resumeTextTruncated = input.resumeText
      ? input.resumeText.substring(0, 8000) 
      : null;

    span.setAttributes({
      "career.currentRole": input.currentRole,
      "career.targetRole": input.targetRole,
      "career.timeframe": input.timeframe,
      "career.resumeTextLength": input.resumeText?.length || 0,
      "career.resumeTextTruncated": resumeTextTruncated ? resumeTextTruncated.length : 0,
      "career.resumeTextPreview": input.resumeText?.substring(0, 500) || "none", // First 500 chars for debugging
      "career.currentSkillsCount": input.currentSkills?.length || 0,
      "career.currentSkills": JSON.stringify(input.currentSkills || []),
    });

    const completion = await openai.chat.completions.create({
    model: DEFAULT_CAREER_MODEL,
    temperature: 0.3, // Lower temperature for more consistent analysis
    max_tokens: 2000, // Increased for detailed analysis
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert career coach and technical recruiter. Analyze what skills the user needs to transition from their current role to their target role.

CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. EXTRACT USER'S CURRENT SKILLS (from resume ONLY):
   - Extract ONLY skills, technologies, tools, frameworks that are EXPLICITLY MENTIONED in the resume text
   - Do NOT infer or assume skills based on role descriptions
   - Do NOT add skills that aren't in the resume
   - Example: If resume says "React, TypeScript, Node.js" → extract ["React", "TypeScript", "Node.js"]
   - Example: If resume says "3 years frontend development" but doesn't list specific tech → do NOT add "React" or "Vue" unless mentioned
   - Create a list of what the user ACTUALLY HAS based on what's written in the resume
   - This becomes "userHasSkills" array

2. IDENTIFY REQUIRED SKILLS (for target role - INDEPENDENT of resume):
   - Identify 10-15 specific, technical skills REQUIRED for the target role
   - Base this on INDUSTRY STANDARDS for the target role, NOT on what's in the resume
   - Consider ROLE LEVEL when determining required skills:
     * Extract level from targetRole: "Junior", "Mid", "Senior", "Lead", "Staff"
     * FOUNDATIONAL SKILLS (needed by ALL levels): Testing, State Management, GraphQL, RESTful API, Git, CI/CD basics
     * MID-LEVEL SKILLS: Performance Optimization, Database Design, API Design, Advanced Testing
     * SENIOR-LEVEL SKILLS: System Design, Architecture, Team Leadership, Mentoring, Technical Strategy
   - Focus on actionable, learnable skills (not personality traits)
   - Include both hard skills (technologies, tools) and soft skills (methodologies, practices)
   - Be specific: "React" not "Frontend", "Docker" not "DevOps"
   - This becomes "requiredSkills" array - should be DIFFERENT from userHasSkills
   - Examples by role level:
     * "Junior Frontend Engineer": ["React", "JavaScript", "TypeScript", "HTML/CSS", "Git", "Testing", "State Management", "RESTful API"]
     * "Mid Frontend Engineer": ["React", "TypeScript", "State Management", "Testing", "Performance Optimization", "Docker", "CI/CD", "GraphQL", "RESTful API"]
     * "Senior Frontend Engineer": ["React", "TypeScript", "System Design", "Performance Optimization", Project Management, Architecture, "Docker", "CI/CD", "Testing", "State Management", "GraphQL", "AWS"]
     * "Backend Engineer": ["Node.js", "Database Design", "API Design", "Docker", "Testing", "CI/CD", "RESTful API"]
     * "Senior Backend Engineer": ["Node.js", "System Design", "Architecture", "Performance Optimization", "Team Leadership", "Docker", "Kubernetes", "AWS", "Database Design", "API Design", "Testing", "CI/CD"]

3. COMPARE AND IDENTIFY GAPS (with skill synonym matching):
   - Compare userHasSkills (from resume) with requiredSkills (for target role)
   - Use SKILL SYNONYMS when matching:
     * "Redux", "XState", "Zustand", "MobX", "Recoil" → "State Management"
     * "Jest", "Mocha", "Cypress", "Vitest", "Testing Library" → "Testing"
     * "GraphQL", "Apollo", "Relay" → "GraphQL"
     * "REST", "RESTful API", "REST API" → "RESTful API"
     * "Docker", "Containerization" → "Docker"
     * "AWS", "Amazon Web Services", "EC2", "S3" → "AWS"
     * "PostgreSQL", "Postgres" → "PostgreSQL"
     * "MongoDB", "Mongo" → "MongoDB"
     * "Express", "Express.js", "ExpressJS" → "Express.js"
     * "Node", "Node.js", "NodeJS" → "Node.js"
     * "React", "ReactJS", "React.js" → "React"
     * "TypeScript", "TS" → "TypeScript"
   - For each required skill, determine:
     * status: "HAS" if skill OR its synonyms exist in userHasSkills, "MISSING" if not
     * priority: "HIGH" if critical for target role, "MEDIUM" if important, "LOW" if nice-to-have
     * reason: Brief explanation of why this skill is important (only for MISSING skills)
   - missingSkills = requiredSkills that are NOT in userHasSkills (after synonym matching)

4. OUTPUT FORMAT:
   {
     "requiredSkills": ["Skill1", "Skill2", ...], // 10-15 skills NEEDED for target role (industry standard)
     "userHasSkills": ["Skill1", "Skill3", ...], // Skills user HAS (from resume only)
     "missingSkills": ["Skill2", "Skill4", ...], // Skills user NEEDS to learn (required - has)
     "skillGapAnalysis": [
       {
         "skill": "React",
         "status": "HAS",
         "priority": "HIGH",
         "reason": null
       },
       {
         "skill": "Docker",
         "status": "MISSING",
         "priority": "HIGH",
         "reason": "Essential for containerization and deployment in modern backend development"
       }
     ]
   }

5. CRITICAL RULES:
   - requiredSkills should be based on TARGET ROLE requirements (industry standards)
   - userHasSkills should be based on RESUME CONTENT ONLY (what's actually written)
   - These two arrays should be DIFFERENT - requiredSkills is what's needed, userHasSkills is what user has
   - If user has all required skills, missingSkills will be empty (rare but possible)
   - If user has few skills, missingSkills will be large (common)
   - All skills must be SPECIFIC and ACTIONABLE (not vague)
   - Include ALL required skills in skillGapAnalysis (both HAS and MISSING)

6. EXAMPLE SCENARIO:
   - Resume mentions: "React, JavaScript, HTML, CSS" (userHasSkills)
   - Target role: "Senior Frontend Engineer"
   - Required skills: ["React", "TypeScript", "System Design", "Performance Optimization", "Docker", "Testing", "State Management", "GraphQL", "CI/CD", "Team Leadership"] (requiredSkills)
   - Missing skills: ["TypeScript", "System Design", "Performance Optimization", "Docker", "Testing", "State Management", "GraphQL", "CI/CD", "Team Leadership"] (missingSkills)
   - Gap analysis: React=HAS, TypeScript=MISSING, System Design=MISSING, etc.

7. LOGIC CHECK:
   - requiredSkills should NOT be identical to userHasSkills (unless user already has all required skills)
   - If they're identical, you're doing it wrong - requiredSkills should reflect target role needs, not resume content
   - missingSkills = requiredSkills - userHasSkills (set difference)

Respond ONLY with valid JSON, no markdown, no code blocks, no explanations.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          currentRole: input.currentRole,
          targetRole: input.targetRole,
          currentSkills: input.currentSkills,
          timeframe: input.timeframe,
          resumeText: resumeTextTruncated,
        }),
      },
    ],
  });

  const rawResponse = completion.choices[0]?.message?.content;
  
  let cleanedResponse = rawResponse;
  if (cleanedResponse) {
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  const parsed = safeJsonParse<SkillGapAnalysis>(cleanedResponse);

  if (!parsed) {
    console.error("Failed to parse skill gap analysis. Raw response:", rawResponse?.substring(0, 500));
    throw new Error(
      `Failed to generate skill gap analysis. Response may be malformed. First 500 chars: ${rawResponse?.substring(0, 500)}`,
    );
  }

  // Validate and clean the parsed response
  if (!parsed.requiredSkills || !Array.isArray(parsed.requiredSkills)) {
    console.warn("Invalid requiredSkills in response, using empty array");
    parsed.requiredSkills = [];
  }

  if (!parsed.userHasSkills || !Array.isArray(parsed.userHasSkills)) {
    console.warn("Invalid userHasSkills in response, using empty array");
    parsed.userHasSkills = [];
  }

  if (!parsed.missingSkills || !Array.isArray(parsed.missingSkills)) {
    console.warn("Invalid missingSkills in response, deriving from requiredSkills and userHasSkills");
    // Will be recalculated below with synonym matching
    parsed.missingSkills = [];
  }

  if (!parsed.skillGapAnalysis || !Array.isArray(parsed.skillGapAnalysis)) {
    console.warn("Invalid skillGapAnalysis in response, using empty array");
    parsed.skillGapAnalysis = [];
  }

  // Skill synonym mapping for matching
  const skillSynonyms: Record<string, string[]> = {
    "state management": ["redux", "xstate", "zustand", "mobx", "recoil", "jotai", "valtio"],
    "testing": ["jest", "mocha", "cypress", "vitest", "testing library", "enzyme", "react testing library"],
    "graphql": ["graphql", "apollo", "relay"],
    "restful api": ["rest", "restful api", "rest api", "restful"],
    "docker": ["docker", "containerization", "containers"],
    "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudformation"],
    "postgresql": ["postgresql", "postgres"],
    "mongodb": ["mongodb", "mongo"],
    "express.js": ["express", "express.js", "expressjs"],
    "node.js": ["node", "node.js", "nodejs"],
    "react": ["react", "reactjs", "react.js"],
    "typescript": ["typescript", "ts"],
  };

  // Create reverse mapping: synonym -> canonical skill
  const synonymToCanonical: Record<string, string> = {};
  Object.entries(skillSynonyms).forEach(([canonical, synonyms]) => {
    synonyms.forEach((synonym) => {
      synonymToCanonical[synonym.toLowerCase()] = canonical.toLowerCase();
    });
    synonymToCanonical[canonical.toLowerCase()] = canonical.toLowerCase(); // Self-reference
  });

  // Normalize skills using synonyms
  const normalizeSkill = (skill: string): string => {
    const skillLower = skill.toLowerCase().trim();
    return synonymToCanonical[skillLower] || skillLower;
  };

  // Clean and validate skill gap analysis
  const hasSet = new Set(
    parsed.userHasSkills.map((s) => normalizeSkill(s))
  );
  const requiredSet = new Set(
    parsed.requiredSkills.map((s) => normalizeSkill(s))
  );

  parsed.skillGapAnalysis = parsed.skillGapAnalysis
    .filter((item) => {
      if (!item.skill || typeof item.skill !== "string") return false;
      if (!item.status || !["HAS", "MISSING"].includes(item.status)) return false;
      if (!item.priority || !["HIGH", "MEDIUM", "LOW"].includes(item.priority)) {
        return false;
      }
      return true;
    })
    .map((item) => {
      const skillLower = item.skill.toLowerCase().trim();
      
      // Ensure status matches reality
      let status = item.status;
      if (hasSet.has(skillLower)) {
        status = "HAS";
      } else if (requiredSet.has(skillLower)) {
        status = "MISSING";
      } else {
        // Skill not in required list, skip it
        return null;
      }

      // Ensure priority is valid
      let priority = item.priority;
      if (!["HIGH", "MEDIUM", "LOW"].includes(priority)) {
        priority = "MEDIUM"; // Default
      }

      return {
        skill: item.skill.trim(),
        status,
        priority,
        reason: status === "MISSING" && item.reason ? item.reason.trim() : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    // Sort: MISSING skills first (what user needs to learn), then by priority
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "MISSING" ? -1 : 1;
      }
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    });

  // Recalculate missingSkills using synonym matching
  const normalizedHasSet = new Set(
    parsed.userHasSkills.map((s) => normalizeSkill(s))
  );
  const normalizedRequiredSet = new Set(
    parsed.requiredSkills.map((s) => normalizeSkill(s))
  );

  // Find missing skills (required skills not in userHasSkills, considering synonyms)
  const actualMissingSkills = parsed.requiredSkills.filter((requiredSkill) => {
    const normalizedRequired = normalizeSkill(requiredSkill);
    // Check if user has this skill or any of its synonyms
    return !normalizedHasSet.has(normalizedRequired) &&
      !Array.from(normalizedHasSet).some((hasSkill) => {
        const normalizedHas = normalizeSkill(hasSkill);
        return normalizedHas === normalizedRequired;
      });
  });

  // Ensure all arrays are unique and cleaned
  parsed.requiredSkills = [...new Set(parsed.requiredSkills)]
    .filter((skill) => skill && typeof skill === "string" && skill.trim().length > 0)
    .map((skill) => skill.trim());

  parsed.userHasSkills = [...new Set(parsed.userHasSkills)]
    .filter((skill) => skill && typeof skill === "string" && skill.trim().length > 0)
    .map((skill) => skill.trim());

  // Update missingSkills with accurate calculation
  parsed.missingSkills = [...new Set(actualMissingSkills)]
    .filter((skill) => skill && typeof skill === "string" && skill.trim().length > 0)
    .map((skill) => skill.trim());

  span.setAttributes({
    "career.extracted.requiredSkillsCount": parsed.requiredSkills.length,
    "career.extracted.requiredSkills": JSON.stringify(parsed.requiredSkills),
    "career.extracted.userHasSkillsCount": parsed.userHasSkills.length,
    "career.extracted.userHasSkills": JSON.stringify(parsed.userHasSkills),
    "career.extracted.missingSkillsCount": parsed.missingSkills.length,
    "career.extracted.missingSkills": JSON.stringify(parsed.missingSkills),
    "career.extracted.skillGapAnalysisCount": parsed.skillGapAnalysis.length,
  });

  span.setStatus({ code: 1 }); // OK
  span.end();

  return parsed;
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message }); // ERROR
    span.end();
    throw error;
  }
};

export interface RoadmapResource {
  title: string;
  url?: string;
  resourceType: ResourceType;
  description?: string;
  estimatedHours?: number;
  difficulty?: Difficulty;
  isPaid?: boolean; // true for paid courses, false for free, undefined if unknown
  price?: string; // e.g., "$49.99", "Free", "Subscription-based", "€29.99"
}

export interface RoadmapTask {
  title: string;
  description?: string;
  type: TaskType;
  estimatedHours?: number;
  dueInWeeks?: number;
  resources?: RoadmapResource[];
  subtopics?: string[]; // Detailed list of things to learn/cover
  suggestedProjects?: Array<{
    title: string;
    description: string;
    difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  }>; // Suggested practical projects
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  durationWeeks: number;
  focus: string;
  tasks: RoadmapTask[];
  milestone?: {
    title: string;
    dueInWeeks: number;
    description?: string;
  };
}

export interface RoadmapPlan {
  overview: string;
  totalWeeks: number;
  phases: RoadmapPhase[];
}

export interface RoadmapInput {
  currentRole: string;
  targetRole: string;
  timeframe: Timeframe;
  currentSkills: string[];
  analysis: SkillGapAnalysis | null; 
  resumeText?: string | null;
  existingProgress?: {
    completedSkills?: string[];
    blockedAreas?: string[];
  };
  jobMarketInsights?: JobMarketInsights | null;
  useWebSearch?: boolean;
}

export const generateRoadmapPlan = async (
  input: RoadmapInput,
  abortSignal?: AbortSignal,
): Promise<RoadmapPlan> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const tracer = trace.getTracer("career-service");
  const span = tracer.startSpan("generateRoadmapPlan");

  try {
    const resumeTextTruncated = input.resumeText
      ? input.resumeText.substring(0, 8000) 
      : null;

    span.setAttributes({
      "roadmap.currentRole": input.currentRole,
      "roadmap.targetRole": input.targetRole,
      "roadmap.timeframe": input.timeframe,
      "roadmap.hasAnalysis": input.analysis !== null,
      "roadmap.resumeTextLength": input.resumeText?.length || 0,
      "roadmap.resumeTextTruncated": resumeTextTruncated ? resumeTextTruncated.length : 0,
      "roadmap.currentSkillsCount": input.currentSkills?.length || 0,
      "roadmap.currentSkills": JSON.stringify(input.currentSkills || []),
      "roadmap.hasExistingProgress": input.existingProgress !== undefined,
    });

    if (input.analysis) {
      span.setAttributes({
        "roadmap.analysis.requiredSkillsCount": input.analysis.requiredSkills?.length || 0,
        "roadmap.analysis.userHasSkillsCount": input.analysis.userHasSkills?.length || 0,
        "roadmap.analysis.missingSkillsCount": input.analysis.missingSkills?.length || 0,
        "roadmap.analysis.missingSkills": JSON.stringify(input.analysis.missingSkills || []),
      });
    }

    if (input.jobMarketInsights) {
      span.setAttributes({
        "roadmap.jobMarket.location":
          input.jobMarketInsights.location ||
          input.jobMarketInsights.country,
        "roadmap.jobMarket.sampleSize":
          input.jobMarketInsights.sampleSize,
        "roadmap.jobMarket.totalAvailable":
          input.jobMarketInsights.totalAvailable,
        "roadmap.jobMarket.topRequired": JSON.stringify(
          input.jobMarketInsights.requiredSkills
            .slice(0, 5)
            .map((skill: { skill: string; count: number }) => skill.skill),
        ),
      });
    }

    const sanitizedJobMarket = input.jobMarketInsights
      ? {
          location:
            input.jobMarketInsights.location ||
            input.jobMarketInsights.country,
          sampleSize: input.jobMarketInsights.sampleSize,
          totalAvailable: input.jobMarketInsights.totalAvailable,
          requiredSkills: input.jobMarketInsights.requiredSkills,
          niceToHaveSkills: input.jobMarketInsights.niceToHaveSkills,
          technicalSkills: input.jobMarketInsights.technicalSkills,
          softSkills: input.jobMarketInsights.softSkills,
          domainKnowledge: input.jobMarketInsights.domainKnowledge,
          salary: input.jobMarketInsights.salary,
          topCompanies: input.jobMarketInsights.topCompanies,
          sampleListings:
            input.jobMarketInsights.sampleListings?.slice(0, 3) || [],
        }
      : null;

    if (abortSignal?.aborted) {
      throw new Error("Roadmap generation was cancelled");
    }

    let tavilyResources: {
      courses: Array<{ title: string; url: string; description?: string }>;
      tutorials: Array<{ title: string; url: string; description?: string }>;
      documentation: Array<{ title: string; url: string; description?: string }>;
      certifications: Array<{ title: string; url: string; description?: string }>;
    } = {
      courses: [],
      tutorials: [],
      documentation: [],
      certifications: [],
    };

    if (input.useWebSearch && process.env.TAVILY_API_KEY) {
      try {
        const missingSkills = input.analysis?.missingSkills || [];
        const skillsToSearch = missingSkills.length > 0 
          ? missingSkills.slice(0, 5)
          : input.currentSkills.slice(0, 3);

        if (skillsToSearch.length > 0) {
          const searchPromises = skillsToSearch.flatMap((skill) => [
            searchCourses(skill, { year: new Date().getFullYear(), maxResults: 8 }),
            searchTutorials(skill, { maxResults: 5 }),
            searchDocumentation(skill, { maxResults: 5 }),
          ]);

          const results = await Promise.all(searchPromises);
          
          for (let i = 0; i < results.length; i += 3) {
            const courses = results[i] || [];
            const tutorials = results[i + 1] || [];
            const docs = results[i + 2] || [];

            tavilyResources.courses.push(
              ...courses.map((r) => ({ 
                title: r.title, 
                url: r.url, 
                description: r.description 
              }))
            );
            tavilyResources.tutorials.push(
              ...tutorials.map((r) => ({ 
                title: r.title, 
                url: r.url, 
                description: r.description 
              }))
            );
            tavilyResources.documentation.push(
              ...docs.map((r) => ({ 
                title: r.title, 
                url: r.url, 
                description: r.description 
              }))
            );
          }

          const uniqueCourses = Array.from(
            new Map(tavilyResources.courses.map(r => [r.url, r])).values()
          );
          const uniqueTutorials = Array.from(
            new Map(tavilyResources.tutorials.map(r => [r.url, r])).values()
          );
          const uniqueDocs = Array.from(
            new Map(tavilyResources.documentation.map(r => [r.url, r])).values()
          );

          tavilyResources.courses = uniqueCourses;
          tavilyResources.tutorials = uniqueTutorials;
          tavilyResources.documentation = uniqueDocs;

          console.log(
            `[Roadmap] Found ${tavilyResources.courses.length} courses, ${tavilyResources.tutorials.length} tutorials, ${tavilyResources.documentation.length} docs via Tavily`,
          );
        }
      } catch (error: any) {
        const isQuotaError = error?.response?.status === 429 || 
          error?.message?.toLowerCase().includes("quota") ||
          error?.message?.toLowerCase().includes("rate limit");
        
        if (isQuotaError) {
          console.warn("[Roadmap] Tavily API quota exceeded, falling back to LLM internal knowledge");
        } else {
          console.error("[Roadmap] Tavily search error, falling back to LLM internal knowledge:", error.message);
        }
      }
    }

    const hasTavilyResults = tavilyResources.courses.length > 0 || 
      tavilyResources.tutorials.length > 0 || 
      tavilyResources.documentation.length > 0;

    let tavilyContext = "";
    if (hasTavilyResults) {
      tavilyContext = `

UP-TO-DATE RESOURCES FROM WEB SEARCH:
${tavilyResources.courses.length > 0
  ? `COURSES:\n${tavilyResources.courses.map((c) => `- ${c.title}: ${c.url}${c.description ? ` (${c.description.substring(0, 100)})` : ""}`).join("\n")}`
  : ""}
${tavilyResources.tutorials.length > 0
  ? `TUTORIALS:\n${tavilyResources.tutorials.map((t) => `- ${t.title}: ${t.url}${t.description ? ` (${t.description.substring(0, 100)})` : ""}`).join("\n")}`
  : ""}
${tavilyResources.documentation.length > 0
  ? `DOCUMENTATION:\n${tavilyResources.documentation.map((d) => `- ${d.title}: ${d.url}${d.description ? ` (${d.description.substring(0, 100)})` : ""}`).join("\n")}`
  : ""}

PRIORITIZE these web search results when creating resources. Mark them with "source": "tavily" and "isUpToDate": true.`;
    } else {
      tavilyContext = `

NOTE: If no web search results are provided above, use your internal knowledge to suggest real, current resources (courses, tutorials, documentation) that are relevant and up-to-date. Always prioritize official documentation and well-known learning platforms.`;
    }

    const completion = await openai.chat.completions.create({
    model: DEFAULT_CAREER_MODEL,
    temperature: 0.45,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a career roadmap planner. Generate a structured learning plan as JSON.

IMPORTANT CONTEXT:
- If skillGapAnalysis is provided (not null), use it to create a targeted roadmap addressing specific skill gaps
- If skillGapAnalysis is null/not provided, create a general roadmap based on the role transition (currentRole → targetRole) and currentSkills
- If resume text is provided, use it to understand the user's background and create a personalized roadmap
- If jobMarketInsights is provided, align tasks with the "requiredSkills" (treat these as mandatory) and highlight "niceToHaveSkills" as stretch or advanced goals. Prioritize phases that close the most frequent market gaps and reference market insights in the phase focus/overview (without repeating raw percentages).
- Focus on actionable, learnable skills and practical projects

Generate a structured learning plan as JSON with this exact structure:
{
  "overview": "Brief overview of the roadmap",
  "totalWeeks": number,
  "phases": [
    {
      "phase": number,
      "title": "Phase title",
      "durationWeeks": number,
      "focus": "What this phase focuses on",
      "tasks": [
        {
          "title": "Task title",
          "description": "Task description",
          "type": "LEARNING" | "PROJECT" | "PRACTICE" | "INTERVIEW_PREP" | "CERTIFICATION" | "NETWORKING",
          "estimatedHours": number,
          "dueInWeeks": number,
          "subtopics": ["Specific topic 1", "Specific topic 2", "Specific topic 3"],
          "suggestedProjects": [
            {
              "title": "Project title",
              "description": "What to build and why it's useful",
              "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
            }
          ],
          "resources": [
            {
              "title": "Resource title",
              "url": "REAL_URL_OR_EMPTY_STRING",
              "resourceType": "COURSE" | "VIDEO" | "DOCUMENTATION" | "ARTICLE" | "BOOK" | "TUTORIAL" | "PROJECT_TEMPLATE",
              "description": "Resource description",
              "estimatedHours": number,
              "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
              "isPaid": boolean, // true for paid, false for free, omit if unknown
              "price": "string (e.g., '$49.99', 'Free', 'Subscription-based', '€29.99', 'Varies')" // Include price if known, omit if unknown
            }
          ]
        }
      ],
      "milestone": {
        "title": "Milestone title",
        "dueInWeeks": number,
        "description": "Optional description"
      }
    }
  ]
}

CRITICAL RULES FOR RESOURCES:
1. For "url" field: ONLY provide REAL, ACTUAL URLs to real courses, documentation, videos, or articles
2. If you cannot find a real, verified URL for a resource, set "url" to an EMPTY STRING "" or null
3. NEVER use placeholder URLs like "example.com", "placeholder.com", "test.com", or any fake URLs
4. Only include URLs you know are real and accessible (e.g., official documentation sites, real course platforms like Coursera, Udemy, freeCodeCamp, official docs like MDN, React docs, etc.)
5. If suggesting a book, you can use Amazon, Goodreads, or publisher URLs - but only if they're real
6. For documentation, use official documentation URLs (e.g., docs.python.org, react.dev, nodejs.org/docs)
7. If no real URL exists, leave it empty - it's better to have no URL than a fake one
8. It's good to list course from Coursera, Udemy, freeCodeCamp, official docs like MDN, React docs, etc.

RESOURCE PRICING AND UP-TO-DATE INFORMATION:
1. **DIVIDE PAID VS FREE**: Always specify "isPaid": true for paid courses/resources, "isPaid": false for free resources
2. **INCLUDE PRICE WHEN POSSIBLE**: For paid resources, include "price" field with approximate pricing:
   - Examples: "$49.99", "€29.99", "Free", "Subscription-based", "Varies", "$99-199"
   - For well-known platforms: Udemy courses typically $10-200, Coursera subscriptions $39-79/month, Pluralsight $29-45/month
   - If price is unknown, omit the "price" field but still set "isPaid": true/false
3. **PRIORITIZE UP-TO-DATE RESOURCES**: 
   - Prefer recent courses (2023-2024) over older ones (2020 or earlier)
   - For documentation, always prefer official, current documentation
   - If suggesting older courses, note in description that they may need updates
   - Check if course/resource is still available and active (avoid discontinued courses)
4. **BALANCE PAID AND FREE**: Include a mix of both paid and free resources when possible:
   - Free resources: Official documentation, freeCodeCamp, YouTube tutorials, GitHub tutorials, open-source learning paths
   - Paid resources: Udemy, Coursera, Pluralsight, paid books, premium courses
5. **NOTE ON ACCURACY**: Your knowledge is based on training data up to your knowledge cutoff. Prices and availability may have changed. When in doubt, use approximate pricing ranges or note "Price may vary" in the description.

DETAILED TASK BREAKDOWN:
- For each task, provide "subtopics": an array of 5-10 specific, actionable learning points
  * For LEARNING tasks: List specific concepts, modules, features, or topics to cover
    Example: For "Learn Node.js Basics" → ["Event Loop and Asynchronous Programming", "Core Modules (fs, http, path, os)", "NPM and Package Management", "CommonJS vs ES Modules", "Error Handling and Debugging", "File System Operations", "HTTP Server Creation", "Streams and Buffers"]
  * For PROJECT tasks: List specific features, components, or deliverables
    Example: For "Build RESTful API" → ["Design API endpoints", "Implement CRUD operations", "Add authentication middleware", "Error handling", "Input validation", "Database integration", "API documentation"]
  * For other task types: List relevant subtopics based on the task type

- For each task, provide "suggestedProjects": an array of 1-3 practical project suggestions
  * For TECHNICAL tasks: Suggest real-world practical projects or tasks that apply the learning
    Example: For "Learn Node.js Basics" → [{"title": "CLI File Organizer", "description": "Build a command-line tool that organizes files by type into folders", "difficulty": "BEGINNER"}]
  * For NON-TECHNICAL tasks: Suggest industry-relevant activities
    Example: For "Networking" → [{"title": "Attend 3 Industry Meetups", "description": "Join local tech meetups and connect with professionals in your target role", "difficulty": "BEGINNER"}]
  * Projects should be:
    - Practical and applicable to the target role
    - Appropriate difficulty level for the phase
    - Buildable/achievable within the task timeframe
    - Relevant to the industry/role

RESUME-BASED ROADMAP:
- If resume text is provided, use it to understand the user's actual experience, projects, and achievements
- Create a roadmap that builds on their existing work experience
- Suggest projects and learning that complement their background
- Consider technologies they've already used and build upon them
- Make the roadmap more personalized based on their actual career trajectory
${tavilyContext}

Respond ONLY with valid JSON matching this structure.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          currentRole: input.currentRole,
          targetRole: input.targetRole,
          timeframe: input.timeframe,
          currentSkills: input.currentSkills,
          analysis: input.analysis,
          resumeText: resumeTextTruncated,
          existingProgress: input.existingProgress || null,
          jobMarketInsights: sanitizedJobMarket,
        }),
      },
    ],
  });

  // Check if cancelled after API call
  if (abortSignal?.aborted) {
    throw new Error("Roadmap generation was cancelled");
  }

  const rawResponse = completion.choices[0]?.message?.content;
  
  if (!rawResponse) {
    throw new Error("No response from LLM for roadmap generation");
  }

  if (completion.choices[0]?.finish_reason === "length") {
    console.warn("[Roadmap] Response was truncated due to max_tokens limit");
    throw new Error("Roadmap generation was truncated. The response exceeded the token limit. Please try again or reduce the scope.");
  }
  
  let cleanedResponse = rawResponse;
  if (cleanedResponse) {
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  if (!cleanedResponse || cleanedResponse.length === 0) {
    throw new Error("Empty response from LLM after cleaning");
  }

  const parsed = safeJsonParse<RoadmapPlan>(cleanedResponse);

  if (!parsed) {
    const isIncomplete = !cleanedResponse.endsWith("}") && !cleanedResponse.endsWith("]");
    const errorMsg = isIncomplete 
      ? "Roadmap response appears to be incomplete (truncated JSON). This may indicate the response exceeded token limits."
      : "Failed to parse roadmap plan. Response may be malformed.";
    
    console.error(`[Roadmap] ${errorMsg}`);
    console.error("[Roadmap] Response length:", cleanedResponse.length);
    console.error("[Roadmap] First 1000 chars:", rawResponse?.substring(0, 1000));
    console.error("[Roadmap] Last 500 chars:", rawResponse?.substring(Math.max(0, rawResponse.length - 500)));
    
    throw new Error(`${errorMsg} First 500 chars: ${rawResponse?.substring(0, 500)}`);
  }

  if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
    console.error("Invalid roadmap structure. Parsed:", JSON.stringify(parsed, null, 2));
    throw new Error("Roadmap plan missing phases array");
  }

  const totalTasks = parsed.phases.reduce((sum, phase) => sum + (phase.tasks?.length || 0), 0);
  span.setAttributes({
    "roadmap.generated.totalWeeks": parsed.totalWeeks,
    "roadmap.generated.phasesCount": parsed.phases.length,
    "roadmap.generated.totalTasks": totalTasks,
    "roadmap.generated.overview": parsed.overview?.substring(0, 200) || "none",
  });

  span.setStatus({ code: 1 }); // OK
  span.end();

  return parsed;
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message }); // ERROR
    span.end();
    throw error;
  }
};

export interface QuizSuggestion {
  skill: string;
  suggestedQuizTitle: string;
  difficulty: Difficulty;
  reason: string;
  linkedTaskTitle?: string;
}

export const suggestQuizTopicsFromRoadmap = async (input: {
  targetRole: string;
  currentRole: string;
  pendingTasks: Array<{ title: string; description?: string }>;
}): Promise<QuizSuggestion[]> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  // If no pending tasks, still generate suggestions based on role transition
  if (input.pendingTasks.length === 0) {
    console.log("[Quiz Suggestions] No pending tasks, generating based on role transition");
  }

  const completion = await openai.chat.completions.create({
    model: DEFAULT_CAREER_MODEL,
    temperature: 0.6,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a learning advisor. Generate quiz suggestions to help reinforce learning objectives from a career roadmap.

Return quiz suggestions as JSON with this EXACT structure:
{
  "suggestions": [
    {
      "skill": "string (e.g., 'React', 'TypeScript', 'System Design')",
      "suggestedQuizTitle": "string (specific quiz title)",
      "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      "reason": "string (why this quiz is recommended)",
      "linkedTaskTitle": "string (optional, the task this relates to)"
    }
  ]
}

IMPORTANT:
- Return 4 to 5 quiz suggestions only
- If pendingTasks array is empty, generate suggestions based on the role transition (currentRole -> targetRole)
- Each suggestion should be specific and actionable
- Match difficulty to the task complexity and user's current level
- Make quiz titles descriptive and specific (e.g., "React Hooks and State Management Quiz" not just "React Quiz")
- Link suggestions to specific tasks when possible
- Respond ONLY with valid JSON matching this structure.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          currentRole: input.currentRole,
          targetRole: input.targetRole,
          pendingTasks: input.pendingTasks.length > 0 
            ? input.pendingTasks 
            : [{ title: `Transition from ${input.currentRole} to ${input.targetRole}`, description: "General skill development" }],
        }),
      },
    ],
  });

  const rawResponse = completion.choices[0]?.message?.content;
  
  // Clean markdown code blocks if present
  let cleanedResponse = rawResponse;
  if (cleanedResponse) {
    cleanedResponse = cleanedResponse
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
  }

  type ResponseShape = {
    suggestions: Array<{
      skill: string;
      suggestedQuizTitle: string;
      difficulty: Difficulty;
      reason: string;
      linkedTaskTitle?: string;
    }>;
  };

  const parsed = safeJsonParse<ResponseShape>(cleanedResponse);

  if (!parsed) {
    console.error("Failed to parse quiz suggestions. Raw response:", rawResponse?.substring(0, 500));
    // Return empty array instead of throwing - better UX
    return [];
  }

  // Validate and filter suggestions
  const validSuggestions = (parsed.suggestions || []).filter((s) => {
    return (
      s.skill &&
      s.suggestedQuizTitle &&
      s.difficulty &&
      Object.values(Difficulty).includes(s.difficulty) &&
      s.reason
    );
  });

  if (validSuggestions.length === 0) {
    console.warn("No valid suggestions parsed from AI response");
    return [];
  }

  return validSuggestions;
};

