import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { trace } from "@opentelemetry/api";

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

  const tracer = trace.getTracer("resume-service");
  const span = tracer.startSpan("analyzeResume");

  try {
    span.setAttributes({
      "resume.targetRole": input.targetRole || "none",
      "resume.yearsOfExperience": input.yearsOfExperience || 0,
      "resume.resumeTextLength": input.resumeText.length,
      "resume.resumeTextPreview": input.resumeText.substring(0, 500),
    });

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
   - **IMPORTANT**: When suggesting metrics, frame it as a SUGGESTION/EXAMPLE, not a direct instruction
   - **DO NOT** directly tell users to add specific numbers like "add 40%" - this could encourage fake metrics
   - **INSTEAD**, suggest: "Consider adding quantifiable metrics if you have them, for example: 'Reduced load time by X%', 'Handled X users', 'Improved conversion by X%'"
   - Emphasize that metrics should be REAL and VERIFIABLE - only suggest adding metrics if the user's experience supports it
   - Avoid vague statements like "improved performance" or "worked on features" - but suggest improvement in a way that doesn't encourage fabrication

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

SECTION IDENTIFICATION GUIDE (CRITICAL - READ FIRST):
Before making recommendations, you MUST properly identify and separate sections. Common resume sections and their boundaries:

1. **HEADER/CONTACT INFO** (NOT a section for recommendations):
   - Name, email, phone, location, website, LinkedIn
   - This is NOT part of Overview or any other section
   - Do NOT include contact info in section recommendations

2. **OVERVIEW/SUMMARY/PROFILE**:
   - Usually 2-4 sentences describing the candidate
   - Should be professional summary, NOT contact info
   - Starts after header, before Experience
   - If contact info is mixed here, that's an issue to flag

3. **EXPERIENCE/PROFESSIONAL EXPERIENCE**:
   - Each job is a separate subsection
   - Format: "Job Title at Company Name | Date Range"
   - Bullet points describing responsibilities and achievements
   - Do NOT mix with Projects or Education

4. **PROJECTS/PORTFOLIO**:
   - Personal or academic projects
   - Each project is a separate subsection
   - Format: "Project Name | Tech Stack | Link (if available)"
   - Do NOT mix with Experience entries

5. **SKILLS/TECHNICAL SKILLS**:
   - List of technologies, tools, languages
   - Usually categorized (Frontend, Backend, Tools, etc.)
   - Do NOT mix with Experience descriptions

6. **EDUCATION**:
   - Degree, university, graduation date
   - GPA (if included)
   - Do NOT mix with Experience or Projects

SECTION IDENTIFICATION RULES:
- Look for section headers (all caps, bold, underlined, or clearly separated)
- If sections are mixed (e.g., contact info in Overview), identify this as a STRUCTURAL issue
- Each section recommendation should target ONE specific section only
- If content belongs to multiple sections, create separate recommendations for each
- Quote EXACTLY what text belongs to that section (don't include adjacent sections)

SECTION-BY-SECTION RECOMMENDATIONS (CRITICAL):
For each major section (Overview, Experience, Projects, Skills, Education), provide specific recommendations:

1. **Identify the section CLEARLY**:
   - Use format: "Section Name" or "Section Name - Subsection"
   - Examples: "Overview", "Experience - Software Engineer at Company X", "Projects - E-commerce Platform"
   - If sections are mixed, identify as: "Overview (contains contact info - structural issue)"

2. **Quote current content EXACTLY**:
   - Copy the EXACT text from that section only
   - If content is mixed with other sections, quote only the relevant part
   - Use ellipsis (...) if you're quoting a portion
   - Example: "Software Engineer with 2+ years... [rest of overview text]"

3. **Identify the issue CLEARLY**:
   - Be specific: "Too vague", "Missing metrics", "Mixed with contact info", "No tech stack mentioned"
   - Explain WHY it's a problem: "Recruiters can't assess your experience level"
   - If structural: "Contact information should be in header, not in Overview section"

4. **Provide SPECIFIC, ACTIONABLE recommendation**:
   - Use imperative language: "Add...", "Replace...", "Remove...", "Move..."
   - Be concrete: "Add 2-3 specific technologies you used"
   - **CRITICAL FOR METRICS**: When suggesting metrics, frame as examples/suggestions, not direct instructions
   - **DO NOT** say: "Add 'reduced load time by 40%'" - this encourages fake numbers
   - **INSTEAD** say: "Consider adding quantifiable metrics if you have them, for example: 'reduced load time by X%' or 'handled X users'"
   - Emphasize that metrics should be REAL and VERIFIABLE - only suggest if the experience supports it
   - Include exact wording when helpful: "Change 'worked on features' to 'Built payment system using [specific tech stack]'"
   - If structural: "Move contact info to header section. Overview should only contain professional summary."

5. **Give a clear before/after example**:
   - Show EXACTLY what to change
   - Use "BEFORE:" and "AFTER:" labels clearly
   - Make the improvement obvious
   - If structural: Show how to separate sections properly

6. **Set priority**:
   - HIGH: Critical issues that hurt chances (vague content, missing key info, structural problems)
   - MEDIUM: Important improvements (missing metrics, could be more specific)
   - LOW: Nice-to-have enhancements (minor wording, formatting tweaks)

EXAMPLES OF GOOD SECTION RECOMMENDATIONS:

Example 1 - Overview Section:
{
  "section": "Overview",
  "currentContent": "Experienced software developer with knowledge of various technologies.",
  "issue": "Too vague - doesn't specify technologies, years of experience, or value proposition. Recruiters can't assess your experience level or technical expertise.",
  "recommendation": "REPLACE with specific statement that includes: (1) Years of experience, (2) Specific technologies, (3) Key achievements or value proposition. Use this format: '[Role] with [X] years of experience in [domain]. Specialized in [tech stack]. [One key achievement with metric].'",
  "example": "BEFORE: 'Experienced software developer with knowledge of various technologies.'\n\nAFTER: 'Full-stack developer with 5 years of experience building scalable web applications using React, Node.js, and AWS. Led development of payment systems handling 100K+ transactions daily, improving performance by 40% through database optimization.'",
  "priority": "HIGH"
}

Example 3 - Experience Section:
{
  "section": "Experience - Software Engineer at Company X",
  "currentContent": "Worked on improving application performance and adding new features.",
  "issue": "Vague and lacks specifics - no metrics, no technologies mentioned, doesn't show impact. Recruiters can't understand what you actually did or how well you did it.",
  "recommendation": "REPLACE with specific bullet points that include: (1) What you did (specific feature/task), (2) Technologies used, (3) Measurable impact IF YOU HAVE REAL METRICS. Format: '• [Action verb] [what] using [tech], [metric/impact if available]'. IMPORTANT: Only include metrics if they are real and verifiable. If you don't have specific numbers, focus on describing the technical work and technologies used.",
  "example": "BEFORE: 'Worked on improving application performance and adding new features.'\n\nAFTER (with real metrics):\n'• Optimized database queries and implemented Redis caching, reducing API response time by 40% (500ms → 300ms)\n• Built Stripe payment integration processing 10K+ monthly transactions\n• Tech stack: React, Node.js, PostgreSQL, Redis'\n\nAFTER (without specific metrics - still good):\n'• Optimized database queries and implemented Redis caching to improve API response times\n• Built Stripe payment integration for processing transactions\n• Tech stack: React, Node.js, PostgreSQL, Redis'",
  "priority": "HIGH"
}

Example 4 - Projects Section:
{
  "section": "Projects - E-commerce Platform",
  "currentContent": "Built an e-commerce website with shopping cart functionality.",
  "issue": "Too generic - doesn't show tech stack, complexity, specific features, or your role. Doesn't demonstrate technical skills or project scale.",
  "recommendation": "EXPAND to include: (1) Tech stack (frontend, backend, database), (2) Key features you built, (3) Deployment/infrastructure, (4) Link to demo/GitHub. Format: '[Project Name] | [Tech Stack]\n• [Feature 1 with detail]\n• [Feature 2 with detail]\n• [Deployment info]\n• GitHub: [link]'",
  "example": "BEFORE: 'Built an e-commerce website with shopping cart functionality.'\n\nAFTER:\n'E-commerce Platform | React, Node.js, PostgreSQL, Stripe\n• Implemented user authentication with JWT and OAuth\n• Built payment processing handling 1K+ transactions\n• Designed RESTful APIs with 200ms average response time\n• Deployed on AWS with Docker\n• GitHub: github.com/username/project'",
  "priority": "MEDIUM"
}

Example 5 - Structural Issue (Mixed Sections):
{
  "section": "Overview (contains contact info - structural issue)",
  "currentContent": "QUAN BUI\nSoftware Developer\nquanbui021001@gmail.com | +358 45 333 8012\nHelsinki, Finland\nhttps://quizzai.dev/\n\nSoftware Engineer with 2+ years of experience...",
  "issue": "STRUCTURAL: Contact information (name, email, phone, location, website) is incorrectly placed in Overview section. These should be in a separate Header/Contact section at the top of the resume.",
  "recommendation": "SEPARATE into two sections: (1) Create Header section with contact info only. (2) Keep Overview section with professional summary only. Move all contact details (name, email, phone, location, website) to header.",
  "example": "BEFORE (all in one section):\n'QUAN BUI\nSoftware Developer\nquanbui021001@gmail.com | +358 45 333 8012\nHelsinki, Finland\nhttps://quizzai.dev/\n\nSoftware Engineer with 2+ years...'\n\nAFTER (Header section):\n'QUAN BUI\nSoftware Developer\nquanbui021001@gmail.com | +358 45 333 8012\nHelsinki, Finland | https://quizzai.dev/'\n\nAFTER (Overview section - separate):\n'Software Engineer with 2+ years of experience in developing scalable web applications. Skilled in modern JavaScript/TypeScript/Node.js frameworks, real-time communication, AWS, and AI-powered applications and RAG. Developed QuizzAI, now serving 20+ active users, including paying subscribers.'",
  "priority": "HIGH"
}

IMPORTANT INSTRUCTIONS:
- **SECTION IDENTIFICATION IS CRITICAL**: Before making recommendations, carefully identify where each section starts and ends. Do NOT mix sections together.
- **If sections are mixed** (e.g., contact info in Overview), identify this as a STRUCTURAL issue with HIGH priority
- **Quote content accurately**: Only quote text that belongs to the specific section you're recommending changes for
- **Be CRITICAL but CONSTRUCTIVE**: Point out real issues, especially structural problems
- **Compare against industry standards** for the experience level
- **Don't inflate scores**: Be honest about weaknesses
- **Provide SPECIFIC, ACTIONABLE feedback**: Use imperative verbs (Add, Replace, Remove, Move) and be concrete
- **For sectionRecommendations**: Focus on 5-8 most critical sections, prioritizing structural issues first
- **Include actual quotes**: Copy exact text from resume when providing recommendations
- **Show clear before/after examples**: Make improvements obvious and easy to understand
- **Prioritize sections** that have the biggest impact on hiring decisions
- **Consider the competitive tech job market**: Be realistic about what recruiters expect
- **Look for red flags**: Gaps, inconsistencies, vague claims, mixed sections
- **Reward resumes** that show real impact and technical depth

SECTION RECOMMENDATION FORMAT REQUIREMENTS:
- Each recommendation must target ONE specific section only
- If content spans multiple sections, create separate recommendations for each
- Use clear section names: "Overview", "Experience - [Job Title] at [Company]", "Projects - [Project Name]"
- For structural issues, clearly state what should be moved/separated
- Make recommendations actionable: Tell user exactly what to do (Add X, Replace Y with Z, Move A to B)

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
      span.recordException(new Error("Failed to parse resume analysis"));
      span.setStatus({ code: 2, message: "Failed to parse AI response" });
      span.end();
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

    // Add output attributes
    span.setAttributes({
      "resume.analysis.score": score,
      "resume.analysis.strengthsCount": strengths.length,
      "resume.analysis.weaknessesCount": weaknesses.length,
      "resume.analysis.sectionRecommendationsCount": sectionRecommendations.length,
      "resume.analysis.hasStructuralIssues": sectionRecommendations.some(
        (rec) => rec.issue.toLowerCase().includes("structural") || rec.issue.toLowerCase().includes("mixed")
      ),
    });

    span.setStatus({ code: 1 }); // OK
    span.end();

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
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message }); // ERROR
    span.end();
    throw error;
  }
};

