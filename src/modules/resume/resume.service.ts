import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";

const DEFAULT_RESUME_MODEL =
  process.env.OPENAI_RESUME_MODEL ||
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

export interface ResumeAnalysisInput {
  resumeText: string;
  targetRole?: string;
  yearsOfExperience?: number;
}

export interface SectionRecommendation {
  section: string; // e.g., "Overview", "Experience", "Projects", "Skills"
  currentContent?: string; // What's currently there (if applicable)
  issue: string; // What's wrong or missing
  recommendation: string; // What to change it to
  example?: string; // Example of improved version
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface ResumeAnalysis {
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  suggestions: {
    content: string[];
    formatting: string[];
    keywords: string[];
    atsOptimization: string[];
  };
  sectionRecommendations: SectionRecommendation[]; // NEW: Section-by-section specific recommendations
  summary: string;
}

export const analyzeResume = async (
  input: ResumeAnalysisInput,
): Promise<ResumeAnalysis> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const completion = await openai.chat.completions.create({
    model: DEFAULT_RESUME_MODEL,
    temperature: 0.3,
    max_tokens: 3000, // Increased for detailed section recommendations
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
  "sectionRecommendations": [
    {
      "section": "Overview",
      "currentContent": "Current text from this section (if applicable)",
      "issue": "What's wrong or missing in this section",
      "recommendation": "Specific recommendation for improvement",
      "example": "Example of improved version (show before/after if helpful)",
      "priority": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
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

SECTION-BY-SECTION RECOMMENDATIONS (CRITICAL):
For each major section (Overview, Experience, Projects, Skills, Education), provide specific recommendations:

1. **Identify the section** (e.g., "Overview", "Experience - Job Title at Company", "Projects - Project Name")
2. **Quote current content** (if applicable) - show what's currently there
3. **Identify the issue** - what's wrong, vague, or missing
4. **Provide specific recommendation** - exactly what to change
5. **Give an example** - show improved version with before/after if helpful
6. **Set priority** - HIGH (critical issues), MEDIUM (important improvements), LOW (nice-to-have)

EXAMPLES OF GOOD SECTION RECOMMENDATIONS:

Example 1 - Overview Section:
{
  "section": "Overview",
  "currentContent": "Experienced software developer with knowledge of various technologies.",
  "issue": "Too vague, doesn't specify technologies, years of experience, or value proposition",
  "recommendation": "Replace with specific statement: 'Full-stack developer with 5 years of experience building scalable web applications. Specialized in React, Node.js, and cloud technologies. Proven track record of improving application performance and leading technical initiatives.'",
  "example": "BEFORE: 'Experienced software developer with knowledge of various technologies.'\nAFTER: 'Full-stack developer with 5 years of experience building scalable web applications using React, Node.js, and AWS. Led development of payment systems handling 100K+ transactions daily, improving performance by 40% through database optimization.'",
  "priority": "HIGH"
}

Example 2 - Experience Section:
{
  "section": "Experience - Software Engineer at Company X",
  "currentContent": "Worked on improving application performance and adding new features.",
  "issue": "Vague, no metrics, doesn't show impact or specific technologies used",
  "recommendation": "Add specific metrics and technologies: 'Optimized database queries and implemented caching strategies, reducing API response time by 40% (from 500ms to 300ms). Built payment integration feature using Stripe API, processing 10K+ transactions monthly. Tech stack: React, Node.js, PostgreSQL, Redis.'",
  "example": "BEFORE: 'Worked on improving application performance and adding new features.'\nAFTER: '• Optimized database queries and implemented Redis caching, reducing API response time by 40% (500ms → 300ms)\n• Built Stripe payment integration processing 10K+ monthly transactions\n• Tech: React, Node.js, PostgreSQL, Redis'",
  "priority": "HIGH"
}

Example 3 - Projects Section:
{
  "section": "Projects - E-commerce Platform",
  "currentContent": "Built an e-commerce website with shopping cart functionality.",
  "issue": "Too generic, doesn't show tech stack, complexity, or your specific contributions",
  "recommendation": "Add tech stack, specific features, and your role: 'Full-stack e-commerce platform with React frontend and Node.js backend. Features: user authentication, payment processing (Stripe), inventory management, order tracking. Deployed on AWS with Docker. GitHub: [link]'",
  "example": "BEFORE: 'Built an e-commerce website with shopping cart functionality.'\nAFTER: 'E-commerce Platform | React, Node.js, PostgreSQL, Stripe\n• Implemented user authentication with JWT and OAuth\n• Built payment processing handling 1K+ transactions\n• Designed RESTful APIs with 200ms average response time\n• GitHub: github.com/username/project'",
  "priority": "MEDIUM"
}

IMPORTANT INSTRUCTIONS:
- Be CRITICAL but CONSTRUCTIVE - point out real issues
- Compare against industry standards for the experience level
- Don't inflate scores - be honest about weaknesses
- Provide SPECIFIC, ACTIONABLE feedback with EXAMPLES
- For sectionRecommendations: Focus on 5-8 most critical sections
- Include actual quotes from resume when providing recommendations
- Show before/after examples when helpful
- Prioritize sections that have the biggest impact on hiring decisions
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

  type ResponseShape = {
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: {
      content: string[];
      formatting: string[];
      keywords: string[];
      atsOptimization: string[];
    };
    sectionRecommendations?: Array<{
      section: string;
      currentContent?: string;
      issue: string;
      recommendation: string;
      example?: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
    }>;
    summary: string;
  };

  const rawResponse = completion.choices[0]?.message?.content;
  const parsed = safeJsonParse<ResponseShape>(rawResponse);

  if (!parsed) {
    console.error("Failed to parse resume analysis. Raw response:", rawResponse);
    throw new Error(
      `Failed to analyze resume. Response: ${rawResponse?.substring(0, 200)}`,
    );
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

  // Process section recommendations
  const sectionRecommendations = Array.isArray(parsed.sectionRecommendations)
    ? parsed.sectionRecommendations
        .filter((rec) => {
          // Validate structure
          return (
            rec &&
            typeof rec.section === "string" &&
            typeof rec.issue === "string" &&
            typeof rec.recommendation === "string" &&
            ["HIGH", "MEDIUM", "LOW"].includes(rec.priority)
          );
        })
        .map((rec) => ({
          section: rec.section.trim(),
          currentContent: rec.currentContent?.trim() || undefined,
          issue: rec.issue.trim(),
          recommendation: rec.recommendation.trim(),
          example: rec.example?.trim() || undefined,
          priority: rec.priority,
        }))
        // Sort by priority (HIGH first)
        .sort((a, b) => {
          const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        })
    : [];

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
    sectionRecommendations,
    summary: parsed.summary || "Resume analysis completed",
  };
};

