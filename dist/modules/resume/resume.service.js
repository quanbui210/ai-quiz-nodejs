"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResume = void 0;
const openai_1 = __importDefault(require("openai"));
const DEFAULT_RESUME_MODEL = process.env.OPENAI_RESUME_MODEL ||
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
const analyzeResume = async (input) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not configured");
    }
    const completion = await openai.chat.completions.create({
        model: DEFAULT_RESUME_MODEL,
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: `You are a SENIOR TECHNICAL RECRUITER, HR MANAGER, and TECH LEAD with 10+ years of experience reviewing thousands of resumes for software engineering positions. You have a deep understanding of what makes a resume stand out in competitive tech markets.

Your role is to provide CRITICAL, HONEST, and DETAILED feedback as if you're reviewing this resume for a real hiring decision. Be thorough, specific, and actionable.

Analyze resumes and provide comprehensive feedback as JSON with this EXACT structure:
{
  "score": number (0-100, overall resume quality),
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "suggestions": {
    "content": ["content suggestion 1", ...],
    "formatting": ["formatting suggestion 1", ...],
    "keywords": ["keyword suggestion 1", ...],
    "atsOptimization": ["ATS suggestion 1", ...]
  },
  "summary": "Brief overall assessment (2-3 sentences)"
}

DETAILED EVALUATION CRITERIA (Review each carefully):

1. **TECHNICAL DEPTH & RELEVANCE**:
   - Are technical skills clearly demonstrated through projects/experience?
   - Is there evidence of real-world application (not just listed skills)?
   - Are technologies relevant to current industry standards?
   - Is there progression in complexity/seniority?

2. **QUANTIFIABLE ACHIEVEMENTS**:
   - Are there specific metrics, numbers, or measurable outcomes?
   - Examples: "Reduced load time by 40%", "Handled 10K+ users", "Improved conversion by 25%"
   - Avoid vague statements like "improved performance" or "worked on features"

3. **EXPERIENCE QUALITY**:
   - Does work experience show impact and responsibility?
   - Are achievements specific and technical?
   - Is there evidence of problem-solving and initiative?
   - For junior roles: Are projects substantial enough?
   - Does the experience description describe the work done in a way that is easy to understand and follow?

4. **PROJECT PORTFOLIO**:
   - Are projects well-described with clear tech stacks?
   - Do projects demonstrate full-stack or relevant skills?
   - Are there live demos or GitHub links?
   - Is project complexity appropriate for experience level?
   - Does the project description describe the work done in a way that is easy to understand and follow?

5. **CONTENT STRUCTURE & CLARITY**:
   - Is information easy to scan (6-second test)?
   - Are bullet points concise and impactful?
   - Is there a logical flow (most relevant first)?
   - Are dates, locations, and details consistent?

6. **KEYWORD OPTIMIZATION**:
   - Are relevant technologies mentioned naturally?
   - Is there alignment with target role requirements?
   - Are industry-standard terms used (not outdated)?

7. **ATS COMPATIBILITY**:
   - Is formatting clean and parseable?
   - Are section headings standard (Experience, Education, Skills)?
   - Is there excessive formatting that breaks parsing?
   - Can an ATS extract key information easily?

8. **OVERALL IMPRESSION**:
   - Does this resume tell a compelling story?
   - Would you shortlist this for an interview?
   - Is there anything that raises red flags?
   - Does it demonstrate growth and learning?

SCORING GUIDELINES (Be strict and fair):
- **85-100**: Exceptional - Senior-level quality, would definitely interview
  - Strong technical depth, quantifiable achievements, excellent structure
  - Clear evidence of impact and problem-solving
  - Professional presentation, no major gaps
  
- **70-84**: Very Good - Strong candidate, likely to interview
  - Good technical skills with some demonstration
  - Some quantifiable achievements
  - Minor improvements needed in clarity or depth
  
- **55-69**: Good - Potential candidate, may interview
  - Adequate technical skills but needs more depth
  - Limited quantifiable achievements
  - Structure is okay but could be improved
  
- **40-54**: Fair - Needs significant improvement
  - Skills listed but not well demonstrated
  - Vague descriptions, lack of metrics
  - Structure or clarity issues
  
- **0-39**: Poor - Major overhaul required
  - Critical issues with content, structure, or relevance
  - Missing essential information
  - Would not pass initial screening

IMPORTANT INSTRUCTIONS:
- Be CRITICAL but CONSTRUCTIVE - point out real issues
- Compare against industry standards for the experience level
- Don't inflate scores - be honest about weaknesses
- Provide SPECIFIC, ACTIONABLE feedback
- Consider the competitive tech job market
- Look for red flags (gaps, inconsistencies, vague claims)
- Reward resumes that show real impact and technical depth

Respond ONLY with valid JSON matching this structure.`,
            },
            {
                role: "user",
                content: JSON.stringify({
                    resumeText: input.resumeText,
                    targetRole: input.targetRole || null,
                    yearsOfExperience: input.yearsOfExperience || null,
                }),
            },
        ],
    });
    const rawResponse = completion.choices[0]?.message?.content;
    const parsed = safeJsonParse(rawResponse);
    if (!parsed) {
        console.error("Failed to parse resume analysis. Raw response:", rawResponse);
        throw new Error(`Failed to analyze resume. Response: ${rawResponse?.substring(0, 200)}`);
    }
    const score = Math.min(Math.max(parsed.score ?? 50, 0), 100);
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [];
    const suggestions = parsed.suggestions || {
        content: [],
        formatting: [],
        keywords: [],
        atsOptimization: [],
    };
    return {
        score,
        strengths,
        weaknesses,
        suggestions: {
            content: Array.isArray(suggestions.content) ? suggestions.content : [],
            formatting: Array.isArray(suggestions.formatting)
                ? suggestions.formatting
                : [],
            keywords: Array.isArray(suggestions.keywords) ? suggestions.keywords : [],
            atsOptimization: Array.isArray(suggestions.atsOptimization)
                ? suggestions.atsOptimization
                : [],
        },
        summary: parsed.summary || "Resume analysis completed",
    };
};
exports.analyzeResume = analyzeResume;
//# sourceMappingURL=resume.service.js.map