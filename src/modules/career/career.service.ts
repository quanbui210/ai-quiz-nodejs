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
  requiredSkills: string[];
  skillGapAnalysis: Array<{
    skill: string;
    currentLevel: number;
    requiredLevel: number;
    gap: number;
    priority: "HIGH" | "MEDIUM" | "LOW";
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
    temperature: 0.4,
    max_tokens: 1000, // Increased for better responses
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a career coach. Analyze the user's background and compare their current skills with target role requirements. Output JSON describing skill gaps.

IMPORTANT:
- If resume text is provided, extract actual skills, experience, technologies, and achievements from the resume
- Use the resume to understand real work experience, projects, and demonstrated skills
- Combine resume-extracted skills with any provided currentSkills list
- Be more accurate by understanding the user's actual background from the resume
- Consider years of experience, technologies used, and projects completed when assessing skill levels
- Respond with valid JSON only, no markdown, no code blocks`,
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
  analysis: SkillGapAnalysis;
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
        content: `You are a career roadmap planner. Generate a structured learning plan as JSON with this exact structure:
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

  const completion = await openai.chat.completions.create({
    model: DEFAULT_CAREER_MODEL,
    temperature: 0.5,
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You create quiz ideas that reinforce learning objectives. Read the pending tasks and return 3-5 quiz suggestions (JSON).",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
  });

  type ResponseShape = {
    suggestions: Array<{
      skill: string;
      suggestedQuizTitle: string;
      difficulty: Difficulty;
      reason: string;
      linkedTaskTitle?: string;
    }>;
  };

  const parsed = safeJsonParse<ResponseShape>(
    completion.choices[0]?.message?.content,
  );

  return parsed?.suggestions || [];
};

