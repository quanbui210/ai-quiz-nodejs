import OpenAI from "openai";
import { InterviewLevel, QuestionCategory } from "@prisma/client";

const DEFAULT_INTERVIEW_MODEL =
  process.env.OPENAI_INTERVIEW_MODEL ||
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

export interface GenerateQuestionInput {
  role: string;
  roleDescription?: string | null;
  level: InterviewLevel;
  yearsOfExperience?: number | null;
  country?: string | null;
  industry?: string | null;
  previousQuestions?: string[];
  preferredCategory?: QuestionCategory;
  resumeHighlights?: string[];
}

export interface GeneratedQuestion {
  question: string;
  category: QuestionCategory;
  rationale?: string;
  followUp?: string[];
}

export interface EvaluateAnswerInput {
  role: string;
  level: InterviewLevel;
  question: string;
  category: QuestionCategory;
  answer: string;
  resumeHighlights?: string[];
}

export interface EvaluatedAnswer {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  improvementTips?: string;
  starFormatScore?: {
    situation: number;
    task: number;
    action: number;
    result: number;
  };
}

export const generateInterviewQuestion = async (
  input: GenerateQuestionInput,
): Promise<GeneratedQuestion> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const messages = [
    {
      role: "system" as const,
      content: `You are an experienced technical interviewer. Generate ONE SINGLE interview question as JSON with this EXACT structure:
{
  "question": "The interview question text",
  "category": "TECHNICAL" | "BEHAVIORAL" | "SYSTEM_DESIGN" | "HR" | "CULTURE_FIT",
  "rationale": "Why this question is relevant (optional)",
  "followUp": ["Optional follow-up questions"]
}

IMPORTANT: 
- Return ONLY ONE question object, NOT an array. The root object must have "question" and "category" fields directly.
- Tailor the question to the specific industry (e.g., e-commerce, edtech, communications, security, advertising) if provided.
- Use the role description to understand specific responsibilities, technologies, team context, and requirements.
- Consider industry-specific challenges, technologies, and best practices when generating the question.
- Make the question relevant to the actual day-to-day work described in the role description.`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        role: input.role,
        roleDescription: input.roleDescription || null,
        level: input.level,
        yearsOfExperience: input.yearsOfExperience,
        country: input.country,
        industry: input.industry || null,
        previousQuestions: input.previousQuestions,
        preferredCategory: input.preferredCategory || null,
        resumeHighlights: input.resumeHighlights,
      }),
    },
  ];

  const completion = await openai.chat.completions.create({
    model: DEFAULT_INTERVIEW_MODEL,
    temperature: 0.6,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages,
  });

  type ResponseShape = {
    question: string;
    category: QuestionCategory;
    rationale?: string;
    followUp?: string[];
  };

  type ArrayResponseShape = {
    questions?: Array<{
      question: string;
      category: QuestionCategory;
      rationale?: string;
      followUp?: string[];
    }>;
  };

  const rawResponse = completion.choices[0]?.message?.content;
  const rawParsed = safeJsonParse<ResponseShape | ArrayResponseShape>(rawResponse);

  if (!rawParsed) {
    console.error("Failed to parse interview question. Raw response:", rawResponse);
    throw new Error(
      `Failed to parse interview question. Response: ${rawResponse?.substring(0, 200)}`,
    );
  }

  // Handle case where AI returns array of questions
  let parsed: ResponseShape;
  if ("questions" in rawParsed && Array.isArray(rawParsed.questions) && rawParsed.questions.length > 0) {
    console.warn("AI returned array of questions, using first one");
    parsed = rawParsed.questions[0] as ResponseShape;
  } else if ("question" in rawParsed) {
    parsed = rawParsed as ResponseShape;
  } else {
    console.error("Invalid question structure. Parsed:", JSON.stringify(rawParsed, null, 2));
    throw new Error("Interview question missing or invalid question field");
  }

  // Ensure we have a valid question object
  if (!parsed.question || typeof parsed.question !== "string") {
    console.error("Invalid question structure. Parsed:", JSON.stringify(parsed, null, 2));
    throw new Error("Interview question missing or invalid question field");
  }

  const category = Object.values(QuestionCategory).includes(parsed.category)
    ? parsed.category
    : QuestionCategory.TECHNICAL;

  return {
    question: parsed.question.trim(),
    category,
    rationale: parsed.rationale,
    followUp: parsed.followUp,
  };
};

export const evaluateInterviewAnswer = async (
  input: EvaluateAnswerInput,
): Promise<EvaluatedAnswer> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const messages = [
    {
      role: "system" as const,
      content:
        "You are an interview coach. Score the answer from 1-10, highlighting strengths, weaknesses, and actionable suggestions. Respond ONLY with JSON.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        question: input.question,
        category: input.category,
        role: input.role,
        level: input.level,
        answer: input.answer,
        resumeHighlights: input.resumeHighlights,
      }),
    },
  ];

  const completion = await openai.chat.completions.create({
    model: DEFAULT_INTERVIEW_MODEL,
    temperature: 0.5,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages,
  });

  type ResponseShape = {
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    improvementTips?: string;
    starFormatScore?: {
      situation: number;
      task: number;
      action: number;
      result: number;
    };
  };

  const parsed = safeJsonParse<ResponseShape>(
    completion.choices[0]?.message?.content,
  );

  if (!parsed) {
    throw new Error("Failed to evaluate interview answer");
  }

  return {
    score: Math.min(Math.max(parsed.score ?? 5, 0), 10),
    strengths: parsed.strengths || [],
    weaknesses: parsed.weaknesses || [],
    suggestions: parsed.suggestions || [],
    improvementTips: parsed.improvementTips,
    starFormatScore: parsed.starFormatScore,
  };
};

export interface SessionSummaryInput {
  role: string;
  level: InterviewLevel;
  answers: Array<{
    question: string;
    answer: string;
    score?: number | null;
    strengths?: string[];
    weaknesses?: string[];
  }>;
}

export interface SessionSummary {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export const summarizeInterviewSession = async (
  input: SessionSummaryInput,
): Promise<SessionSummary> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const completion = await openai.chat.completions.create({
    model: DEFAULT_INTERVIEW_MODEL,
    temperature: 0.4,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior hiring manager providing interview feedback. Generate a comprehensive summary as JSON with this EXACT structure:
{
  "overallScore": number (0-10),
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "recommendations": ["actionable recommendation 1", "recommendation 2", ...]
}

IMPORTANT:
- "strengths": List 3-5 key strengths demonstrated across all answers
- "weaknesses": List 3-5 key areas for improvement across all answers
- "recommendations": Provide 3-5 actionable, specific recommendations for the candidate to improve (e.g., "Study system design patterns", "Practice explaining technical concepts", "Learn about authentication best practices")
- Recommendations should be specific, actionable, and help the candidate prepare for future interviews
- Respond ONLY with valid JSON matching this structure.`,
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
  });

  type ResponseShape = {
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };

  const rawResponse = completion.choices[0]?.message?.content;
  const parsed = safeJsonParse<ResponseShape>(rawResponse);

  if (!parsed) {
    console.error("Failed to parse session summary. Raw response:", rawResponse);
    throw new Error(
      `Failed to summarize interview session. Response: ${rawResponse?.substring(0, 200)}`,
    );
  }

  // Ensure all arrays exist and have content
  const recommendations = parsed.recommendations || [];
  if (recommendations.length === 0) {
    console.warn("No recommendations generated, creating default recommendations");
    // Fallback recommendations if AI doesn't provide any
    recommendations.push(
      "Review the questions you struggled with and research those topics",
      "Practice explaining technical concepts clearly and concisely",
      "Prepare specific examples from your experience that demonstrate relevant skills",
    );
  }

  return {
    overallScore: parsed.overallScore ?? 0,
    strengths: parsed.strengths || [],
    weaknesses: parsed.weaknesses || [],
    recommendations,
  };
};

