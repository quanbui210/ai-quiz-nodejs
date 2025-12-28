import OpenAI from "openai";

const DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TrimmedResume {
  overview: string | null;
  workExperience: string;
  skills: string[];
  totalChars: number;
  originalChars: number;
  reductionPercent: number;
}

export async function trimResumeForRoadmap(
  resumeText: string,
  targetRole?: string,
): Promise<TrimmedResume> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const originalChars = resumeText.length;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a resume parser. Extract only the essential sections needed for career roadmap generation.

Extract from the resume:
1. Overview/Summary section (if exists) - professional summary or objective
2. Work Experience - all job positions with descriptions, responsibilities, and achievements
3. Skills - technical skills, tools, technologies, programming languages

Remove completely:
- Contact information (email, phone, address, LinkedIn URL)
- Personal projects section (unless it's the only work experience)
- Education details (unless specific degree is required for target role)
- References section
- Certifications (unless directly relevant to target role)
- Awards and honors
- Volunteer work (unless highly relevant)
- Languages (unless specified in target role requirements)

Output format:
{
  "overview": "Professional summary or null if not present",
  "workExperience": "All work experience combined, one job per paragraph",
  "skills": ["Skill1", "Skill2", "Skill3", ...]
}

Keep work experience detailed but concise. Include job titles, companies, dates, and key responsibilities.`,
        },
        {
          role: "user",
          content: `Extract essential sections from this resume for career roadmap generation${targetRole ? ` targeting role: ${targetRole}` : ""}:\n\n${resumeText.substring(0, 12000)}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from LLM for resume trimming");
    }

    const parsed = JSON.parse(content) as {
      overview?: string | null;
      workExperience: string;
      skills: string[];
    };

    const trimmedParts = [
      parsed.overview,
      parsed.workExperience,
      `Skills: ${parsed.skills.join(", ")}`,
    ].filter(Boolean) as string[];

    const trimmedText = trimmedParts.join("\n\n");
    const totalChars = trimmedText.length;
    const reductionPercent = Math.round(
      ((originalChars - totalChars) / originalChars) * 100,
    );

    return {
      overview: parsed.overview || null,
      workExperience: parsed.workExperience,
      skills: parsed.skills || [],
      totalChars,
      originalChars,
      reductionPercent,
    };
  } catch (error: any) {
    console.error("[Resume Trimmer] Error:", error);
    const fallbackText = resumeText.substring(0, 4000);
    return {
      overview: null,
      workExperience: fallbackText,
      skills: [],
      totalChars: fallbackText.length,
      originalChars,
      reductionPercent: Math.round(
        ((originalChars - fallbackText.length) / originalChars) * 100,
      ),
    };
  }
}

