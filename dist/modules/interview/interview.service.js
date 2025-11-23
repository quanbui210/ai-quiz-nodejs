"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeInterviewSession = exports.evaluateInterviewAnswer = exports.generateInterviewQuestion = void 0;
const openai_1 = __importDefault(require("openai"));
const client_1 = require("@prisma/client");
const DEFAULT_INTERVIEW_MODEL = process.env.OPENAI_INTERVIEW_MODEL ||
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
const generateInterviewQuestion = async (input) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not configured");
    }
    const messages = [
        {
            role: "system",
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
            role: "user",
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
    const rawResponse = completion.choices[0]?.message?.content;
    const rawParsed = safeJsonParse(rawResponse);
    if (!rawParsed) {
        console.error("Failed to parse interview question. Raw response:", rawResponse);
        throw new Error(`Failed to parse interview question. Response: ${rawResponse?.substring(0, 200)}`);
    }
    let parsed;
    if ("questions" in rawParsed && Array.isArray(rawParsed.questions) && rawParsed.questions.length > 0) {
        console.warn("AI returned array of questions, using first one");
        parsed = rawParsed.questions[0];
    }
    else if ("question" in rawParsed) {
        parsed = rawParsed;
    }
    else {
        console.error("Invalid question structure. Parsed:", JSON.stringify(rawParsed, null, 2));
        throw new Error("Interview question missing or invalid question field");
    }
    if (!parsed.question || typeof parsed.question !== "string") {
        console.error("Invalid question structure. Parsed:", JSON.stringify(parsed, null, 2));
        throw new Error("Interview question missing or invalid question field");
    }
    const category = Object.values(client_1.QuestionCategory).includes(parsed.category)
        ? parsed.category
        : client_1.QuestionCategory.TECHNICAL;
    return {
        question: parsed.question.trim(),
        category,
        rationale: parsed.rationale,
        followUp: parsed.followUp,
    };
};
exports.generateInterviewQuestion = generateInterviewQuestion;
const evaluateInterviewAnswer = async (input) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not configured");
    }
    const messages = [
        {
            role: "system",
            content: "You are an interview coach. Score the answer from 1-10, highlighting strengths, weaknesses, and actionable suggestions. Respond ONLY with JSON.",
        },
        {
            role: "user",
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
    const parsed = safeJsonParse(completion.choices[0]?.message?.content);
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
exports.evaluateInterviewAnswer = evaluateInterviewAnswer;
const summarizeInterviewSession = async (input) => {
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
    const rawResponse = completion.choices[0]?.message?.content;
    const parsed = safeJsonParse(rawResponse);
    if (!parsed) {
        console.error("Failed to parse session summary. Raw response:", rawResponse);
        throw new Error(`Failed to summarize interview session. Response: ${rawResponse?.substring(0, 200)}`);
    }
    const recommendations = parsed.recommendations || [];
    if (recommendations.length === 0) {
        console.warn("No recommendations generated, creating default recommendations");
        recommendations.push("Review the questions you struggled with and research those topics", "Practice explaining technical concepts clearly and concisely", "Prepare specific examples from your experience that demonstrate relevant skills");
    }
    return {
        overallScore: parsed.overallScore ?? 0,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        recommendations,
    };
};
exports.summarizeInterviewSession = summarizeInterviewSession;
//# sourceMappingURL=interview.service.js.map