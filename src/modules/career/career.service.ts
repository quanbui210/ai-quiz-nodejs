import OpenAI from "openai";
import {
  Difficulty,
  ResourceType,
  TaskType,
  Timeframe,
} from "@prisma/client";

const DEFAULT_CAREER_MODEL =
  process.env.OPENAI_CAREER_MODEL ||
  process.env.OPENAI_DEFAULT_MODEL ||
  "gpt-4o-mini";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  requiredSkills: string[]; // All skills needed for target role
  userHasSkills: string[]; // Skills user already has (from resume)
  missingSkills: string[]; // Skills user needs to learn (required - has)
  skillGapAnalysis: Array<{
    skill: string; // Skill name
    status: "HAS" | "MISSING"; // Simple binary: user has it or needs to learn it
    priority: "HIGH" | "MEDIUM" | "LOW"; // Priority for learning (based on importance for target role)
    reason?: string; // Why this skill is important for the target role
  }>;
}

export const generateSkillGapAnalysis = async (
  input: SkillGapAnalysisInput,
): Promise<SkillGapAnalysis> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  // Truncate resume text if too long to avoid token limits and JSON issues
  const resumeTextTruncated = input.resumeText
    ? input.resumeText.substring(0, 8000) // Limit to 8000 chars
    : null;

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
  
  // Try to clean the response if it has markdown code blocks
  let cleanedResponse = rawResponse;
  if (cleanedResponse) {
    // Remove markdown code blocks if present
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

  return parsed;
};

export interface RoadmapResource {
  title: string;
  url?: string;
  resourceType: ResourceType;
  description?: string;
  estimatedHours?: number;
  difficulty?: Difficulty;
}

export interface RoadmapTask {
  title: string;
  description?: string;
  type: TaskType;
  estimatedHours?: number;
  dueInWeeks?: number;
  resources?: RoadmapResource[];
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
  analysis: SkillGapAnalysis | null; // Can be null if no resume provided
  resumeText?: string | null;
  existingProgress?: {
    completedSkills?: string[];
    blockedAreas?: string[];
  };
}

export const generateRoadmapPlan = async (
  input: RoadmapInput,
): Promise<RoadmapPlan> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  // Truncate resume text if too long to avoid token limits and JSON issues
  const resumeTextTruncated = input.resumeText
    ? input.resumeText.substring(0, 8000) // Limit to 8000 chars
    : null;

  const completion = await openai.chat.completions.create({
    model: DEFAULT_CAREER_MODEL,
    temperature: 0.45,
    max_tokens: 2500, // Increased for better responses
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a career roadmap planner. Generate a structured learning plan as JSON.

IMPORTANT CONTEXT:
- If skillGapAnalysis is provided (not null), use it to create a targeted roadmap addressing specific skill gaps
- If skillGapAnalysis is null/not provided, create a general roadmap based on the role transition (currentRole → targetRole) and currentSkills
- If resume text is provided, use it to understand the user's background and create a personalized roadmap
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
          "resources": [
            {
              "title": "Resource title",
              "url": "REAL_URL_OR_EMPTY_STRING",
              "resourceType": "COURSE" | "VIDEO" | "DOCUMENTATION" | "ARTICLE" | "BOOK" | "TUTORIAL" | "PROJECT_TEMPLATE",
              "description": "Resource description",
              "estimatedHours": number,
              "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
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

RESUME-BASED ROADMAP:
- If resume text is provided, use it to understand the user's actual experience, projects, and achievements
- Create a roadmap that builds on their existing work experience
- Suggest projects and learning that complement their background
- Consider technologies they've already used and build upon them
- Make the roadmap more personalized based on their actual career trajectory

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
        }),
      },
    ],
  });

  const rawResponse = completion.choices[0]?.message?.content;
  
  // Try to clean the response if it has markdown code blocks
  let cleanedResponse = rawResponse;
  if (cleanedResponse) {
    // Remove markdown code blocks if present
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }
  
  const parsed = safeJsonParse<RoadmapPlan>(cleanedResponse);

  if (!parsed) {
    console.error("Failed to parse roadmap plan. Raw response:", rawResponse?.substring(0, 1000));
    throw new Error(
      `Failed to generate roadmap plan. Response may be malformed. First 500 chars: ${rawResponse?.substring(0, 500)}`,
    );
  }

  if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
    console.error("Invalid roadmap structure. Parsed:", JSON.stringify(parsed, null, 2));
    throw new Error("Roadmap plan missing phases array");
  }

  return parsed;
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

