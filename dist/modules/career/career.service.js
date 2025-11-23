"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestQuizTopicsFromRoadmap = exports.generateRoadmapPlan = exports.generateSkillGapAnalysis = void 0;
const openai_1 = __importDefault(require("openai"));
const DEFAULT_CAREER_MODEL = process.env.OPENAI_CAREER_MODEL ||
    process.env.OPENAI_DEFAULT_MODEL ||
    "gpt-4o-mini";
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const safeJsonParse = (value) => {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    }
    catch (error) {
        console.warn("Failed to parse AI JSON payload:", error);
        return null;
    }
};
const generateSkillGapAnalysis = async (input) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not configured");
    }
    const resumeTextTruncated = input.resumeText
        ? input.resumeText.substring(0, 8000)
        : null;
    const completion = await openai.chat.completions.create({
        model: DEFAULT_CAREER_MODEL,
        temperature: 0.4,
        max_tokens: 1000,
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
    let cleanedResponse = rawResponse;
    if (cleanedResponse) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }
    const parsed = safeJsonParse(cleanedResponse);
    if (!parsed) {
        console.error("Failed to parse skill gap analysis. Raw response:", rawResponse?.substring(0, 500));
        throw new Error(`Failed to generate skill gap analysis. Response may be malformed. First 500 chars: ${rawResponse?.substring(0, 500)}`);
    }
    return parsed;
};
exports.generateSkillGapAnalysis = generateSkillGapAnalysis;
const generateRoadmapPlan = async (input) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not configured");
    }
    const resumeTextTruncated = input.resumeText
        ? input.resumeText.substring(0, 8000)
        : null;
    const completion = await openai.chat.completions.create({
        model: DEFAULT_CAREER_MODEL,
        temperature: 0.45,
        max_tokens: 2500,
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
    let cleanedResponse = rawResponse;
    if (cleanedResponse) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }
    const parsed = safeJsonParse(cleanedResponse);
    if (!parsed) {
        console.error("Failed to parse roadmap plan. Raw response:", rawResponse?.substring(0, 1000));
        throw new Error(`Failed to generate roadmap plan. Response may be malformed. First 500 chars: ${rawResponse?.substring(0, 500)}`);
    }
    if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
        console.error("Invalid roadmap structure. Parsed:", JSON.stringify(parsed, null, 2));
        throw new Error("Roadmap plan missing phases array");
    }
    return parsed;
};
exports.generateRoadmapPlan = generateRoadmapPlan;
const suggestQuizTopicsFromRoadmap = async (input) => {
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
                content: "You create quiz ideas that reinforce learning objectives. Read the pending tasks and return 3-5 quiz suggestions (JSON).",
            },
            {
                role: "user",
                content: JSON.stringify(input),
            },
        ],
    });
    const parsed = safeJsonParse(completion.choices[0]?.message?.content);
    return parsed?.suggestions || [];
};
exports.suggestQuizTopicsFromRoadmap = suggestQuizTopicsFromRoadmap;
//# sourceMappingURL=career.service.js.map