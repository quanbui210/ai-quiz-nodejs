import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { trace } from "@opentelemetry/api";

const safeJsonParse = <T>(value?: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};
import {
  searchCourses,
  searchTutorials,
  searchDocumentation,
  searchCertifications,
  verifyResourceUrl,
} from "../../utils/tavily-search.service";

const DEFAULT_SKILL_MODEL =
  "gpt-3.5-turbo";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

export interface SkillMasteryResource {
  title: string;
  url?: string;
  resourceType: "COURSE" | "VIDEO" | "DOCUMENTATION" | "ARTICLE" | "BOOK" | "TUTORIAL" | "PROJECT_TEMPLATE";
  description?: string;
  estimatedHours?: number;
  difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  isPaid?: boolean;
  price?: string;
  source?: "tavily" | "llm" | "manual";
  isUpToDate?: boolean;
}

export interface SkillMasteryTask {
  title: string;
  description?: string;
  type: "LEARNING" | "PROJECT" | "PRACTICE" | "CERTIFICATION" | "INTERVIEW_PREP";
  estimatedHours?: number;
  dueInWeeks?: number;
  subtopics?: string[];
  suggestedProjects?: Array<{
    title: string;
    description: string;
    difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  }>;
  resources?: SkillMasteryResource[];
  theory?: {
    content: string;
    keyPoints: string[];
  };
  examples?: Array<{
    type: "code" | "use_case" | "diagram";
    title?: string;
    code?: string;
    language?: string;
    explanation?: string;
    description?: string;
  }>;
  concepts?: string[];
}

export interface SkillMasteryPhase {
  phase: number;
  title: string;
  durationWeeks: number;
  focus: string;
  tasks: SkillMasteryTask[];
  milestone?: {
    title: string;
    dueInWeeks: number;
    description?: string;
  };
}

export interface SkillMasteryPlan {
  overview: string;
  totalWeeks: number;
  currentLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  targetLevel: "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  phases: SkillMasteryPhase[];
}

export interface SkillMasteryInput {
  skillName: string;
  currentLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  targetLevel: "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  currentSkills?: string[];
  resumeText?: string | null;
  includeCertification?: boolean;
  useWebSearch?: boolean;
}

export const generateSkillMasteryRoadmap = async (
  input: SkillMasteryInput,
  abortSignal?: AbortSignal,
): Promise<SkillMasteryPlan> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const tracer = trace.getTracer("skill-mastery-service");
  const span = tracer.startSpan("generateSkillMasteryRoadmap");

  try {
    const resumeTextTruncated = input.resumeText
      ? input.resumeText.substring(0, 4000)
      : null;

    span.setAttributes({
      "skill.name": input.skillName,
      "skill.currentLevel": input.currentLevel || "unknown",
      "skill.targetLevel": input.targetLevel,
      "skill.includeCertification": input.includeCertification || false,
      "skill.hasResume": !!resumeTextTruncated,
      "skill.useWebSearch": input.useWebSearch || false,
    });

    // Check if cancelled before making API call
    if (abortSignal?.aborted) {
      throw new Error("Skill mastery roadmap generation was cancelled");
    }

    // Search for up-to-date resources using Tavily if enabled
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
        console.log(`[Skill Mastery] Searching Tavily for ${input.skillName} resources...`);
        
        const [courses, tutorials, docs, certs] = await Promise.all([
          searchCourses(input.skillName, { year: new Date().getFullYear(), maxResults: 5 }),
          searchTutorials(input.skillName, { maxResults: 3 }),
          searchDocumentation(input.skillName, { maxResults: 3 }),
          input.includeCertification
            ? searchCertifications(input.skillName, { year: new Date().getFullYear(), maxResults: 3 })
            : Promise.resolve([]),
        ]);

        tavilyResources = {
          courses: courses.map((r) => ({ title: r.title, url: r.url, description: r.description })),
          tutorials: tutorials.map((r) => ({ title: r.title, url: r.url, description: r.description })),
          documentation: docs.map((r) => ({ title: r.title, url: r.url, description: r.description })),
          certifications: certs.map((r) => ({ title: r.title, url: r.url, description: r.description })),
        };

        console.log(
          `[Skill Mastery] Found ${tavilyResources.courses.length} courses, ${tavilyResources.tutorials.length} tutorials, ${tavilyResources.documentation.length} docs via Tavily`,
        );
      } catch (error: any) {
        console.error("[Skill Mastery] Tavily search error:", error);
        // Continue without Tavily resources if search fails
      }
    }

    const completion = await openai.chat.completions.create({
      model: DEFAULT_SKILL_MODEL,
      temperature: 0.45,
      max_tokens: 4096, // Model limit: 4096 completion tokens
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a skill mastery roadmap planner. Generate a focused, detailed learning plan to master a specific technical skill.

IMPORTANT CONTEXT:
- This is a SKILL-SPECIFIC roadmap (not a career transition roadmap)
- Focus on deep mastery of ONE skill (e.g., "AWS Lambda", "Python", "AI/ML", "Software Testing")
- Duration should be 1-3 months (shorter than career roadmaps)
- Include theory, examples, and practical projects
- **Certification Decision**: Decide if this skill has a relevant certification path. If yes (e.g., AWS, Docker, Kubernetes have official certs), add a CERTIFICATION task in the final phase. If no (e.g., React, TypeScript don't have official certs), skip certification.
- If resume text is provided, personalize based on user's background

Generate a structured learning plan as JSON with this exact structure:
{
  "overview": "Brief overview of what mastering this skill entails",
  "totalWeeks": number (1-12, typically 4-8),
  "currentLevel": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null,
  "targetLevel": "INTERMEDIATE" | "ADVANCED" | "EXPERT",
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
          "type": "LEARNING" | "PROJECT" | "PRACTICE" | "CERTIFICATION" | "INTERVIEW_PREP",
          "estimatedHours": number,
          "dueInWeeks": number,
          "subtopics": ["Specific topic 1", "Specific topic 2", ...],
          "suggestedProjects": [
            {
              "title": "Project title",
              "description": "What to build and why it's useful",
              "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
            }
          ],
          "theory": {
            "content": "Detailed theory explanation of the concept (2-3 paragraphs)",
            "keyPoints": ["Key point 1", "Key point 2", ...]
          },
          "examples": [
            {
              "type": "code" | "use_case" | "diagram",
              "title": "Example title",
              "code": "code example if type is code",
              "language": "javascript" | "python" | "typescript" | etc,
              "explanation": "Explanation of the example",
              "description": "Description if type is use_case"
            }
          ],
          "concepts": ["Concept 1", "Concept 2", ...],
          "resources": [
            {
              "title": "Resource title",
              "url": "REAL_URL_OR_EMPTY_STRING",
              "resourceType": "COURSE" | "VIDEO" | "DOCUMENTATION" | "ARTICLE" | "BOOK" | "TUTORIAL" | "PROJECT_TEMPLATE",
              "description": "Resource description",
              "estimatedHours": number,
              "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
              "isPaid": boolean,
              "price": "string (e.g., '$49.99', 'Free', 'Subscription-based')"
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

CRITICAL RULES:
1. **Theory Content**: For each LEARNING task, provide detailed theory content explaining the concept. Make it educational and comprehensive.
2. **Examples**: Include practical examples - code examples for technical skills, use cases for concepts, diagrams for architecture.
3. **Concepts**: List key concepts the user needs to understand for each task.
4. **Resources**: Only include REAL, VERIFIED URLs. Prefer official documentation, well-known courses (Udemy, Coursera, freeCodeCamp), and current resources (2023-2024).
5. **Certification**: Decide if this skill has a relevant certification path. If yes (e.g., AWS, Docker, Kubernetes have official certs), add a CERTIFICATION task in the final phase with certification resources. If no (e.g., React, TypeScript don't have official certs), skip certification. Only add certification if it makes sense for this skill.
6. **Duration**: Keep totalWeeks between 4-8 weeks for most skills. Only extend to 12 weeks for very complex skills (e.g., "AI/ML").
7. **Phases**: Typically 2-4 phases. Each phase should have 2-4 tasks.
8. **Practical Focus**: Emphasize hands-on learning with projects and practice tasks.

RESOURCE RULES:
- ONLY provide REAL URLs to actual courses, documentation, videos, or articles
- If you cannot find a real URL, set "url" to an EMPTY STRING ""
- NEVER use placeholder URLs like "example.com", "placeholder.com"
- Prefer official documentation (e.g., docs.aws.amazon.com, python.org/docs)
- Include mix of free and paid resources
- Mark "isPaid": true for paid, false for free
${tavilyResources.courses.length > 0 || tavilyResources.tutorials.length > 0 || tavilyResources.documentation.length > 0
        ? `
UP-TO-DATE RESOURCES FROM WEB SEARCH (${new Date().getFullYear()}):
These are verified, current resources found via web search. You can use these in your roadmap:
${tavilyResources.courses.length > 0
            ? `COURSES:\n${tavilyResources.courses.map((c) => `- ${c.title}: ${c.url}${c.description ? ` (${c.description.substring(0, 100)})` : ""}`).join("\n")}`
            : ""}
${tavilyResources.tutorials.length > 0
            ? `TUTORIALS:\n${tavilyResources.tutorials.map((t) => `- ${t.title}: ${t.url}${t.description ? ` (${t.description.substring(0, 100)})` : ""}`).join("\n")}`
            : ""}
${tavilyResources.documentation.length > 0
            ? `DOCUMENTATION:\n${tavilyResources.documentation.map((d) => `- ${d.title}: ${d.url}${d.description ? ` (${d.description.substring(0, 100)})` : ""}`).join("\n")}`
            : ""}
${tavilyResources.certifications.length > 0
            ? `CERTIFICATIONS:\n${tavilyResources.certifications.map((c) => `- ${c.title}: ${c.url}${c.description ? ` (${c.description.substring(0, 100)})` : ""}`).join("\n")}`
            : ""}

PRIORITIZE these web search results when creating resources. Mark them with "source": "tavily" and "isUpToDate": true.
You can also add your own resources, but prefer the web search results for up-to-date content.
`
        : ""}

Respond ONLY with valid JSON matching this structure.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            skillName: input.skillName,
            currentLevel: input.currentLevel,
            targetLevel: input.targetLevel,
            currentSkills: input.currentSkills || [],
            resumeText: resumeTextTruncated,
            includeCertification: input.includeCertification || false,
            webSearchResults: tavilyResources.courses.length > 0 || tavilyResources.tutorials.length > 0 || tavilyResources.documentation.length > 0
              ? tavilyResources
              : undefined,
          }),
        },
      ],
    });

    // Check if cancelled after API call
    if (abortSignal?.aborted) {
      throw new Error("Skill mastery roadmap generation was cancelled");
    }

    const rawResponse = completion.choices[0]?.message?.content;

    if (!rawResponse) {
      throw new Error("No response from LLM for skill mastery roadmap generation");
    }

    if (completion.choices[0]?.finish_reason === "length") {
      console.warn("[Skill Mastery] Response was truncated due to max_tokens limit");
      throw new Error(
        "Skill mastery roadmap generation was truncated. The response exceeded the token limit. Please try again.",
      );
    }

    let cleanedResponse = rawResponse;
    if (cleanedResponse) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }

    if (!cleanedResponse || cleanedResponse.length === 0) {
      throw new Error("Empty response from LLM after cleaning");
    }

    const parsed = safeJsonParse<SkillMasteryPlan>(cleanedResponse);

    if (!parsed) {
      const isIncomplete = !cleanedResponse.endsWith("}") && !cleanedResponse.endsWith("]");
      const errorMsg = isIncomplete
        ? "Skill mastery roadmap response appears to be incomplete (truncated JSON)."
        : "Failed to parse skill mastery roadmap plan. Response may be malformed.";

      console.error(`[Skill Mastery] ${errorMsg}`);
      console.error("[Skill Mastery] Response length:", cleanedResponse.length);
      console.error("[Skill Mastery] First 1000 chars:", rawResponse?.substring(0, 1000));

      throw new Error(`${errorMsg} First 500 chars: ${rawResponse?.substring(0, 500)}`);
    }

    if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
      console.error("Invalid skill mastery roadmap structure. Parsed:", JSON.stringify(parsed, null, 2));
      throw new Error("Skill mastery roadmap plan missing phases array");
    }

    // Enhance resources with Tavily metadata if web search was used
    if (input.useWebSearch && process.env.TAVILY_API_KEY) {
      for (const phase of parsed.phases) {
        for (const task of phase.tasks || []) {
          if (task.resources) {
            for (const resource of task.resources) {
              // Check if resource URL matches any Tavily result
              const tavilyMatch =
                tavilyResources.courses.find((r) => r.url === resource.url) ||
                tavilyResources.tutorials.find((r) => r.url === resource.url) ||
                tavilyResources.documentation.find((r) => r.url === resource.url) ||
                tavilyResources.certifications.find((r) => r.url === resource.url);

              if (tavilyMatch) {
                resource.source = "tavily";
                resource.isUpToDate = true;
              } else if (!resource.source) {
                resource.source = "llm";
              }
            }
          }
        }
      }
    }

    const totalTasks = parsed.phases.reduce((sum: number, phase: { tasks?: any[] }) => sum + (phase.tasks?.length || 0), 0);
    span.setAttributes({
      "skill.generated.totalWeeks": parsed.totalWeeks,
      "skill.generated.phasesCount": parsed.phases.length,
      "skill.generated.totalTasks": totalTasks,
      "skill.generated.overview": parsed.overview?.substring(0, 200) || "none",
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

