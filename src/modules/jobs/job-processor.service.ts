import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import prisma from "../../utils/prisma";
import { SKILL_DICTIONARY } from "../market/skills-dictionary";
import { generateEmbedding } from "../../utils/embeddings";

const openai = observeOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}));

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

interface JobAnalysisResult {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  experienceYears?: number;
  educationLevel?: string;
  languageRequirements: string[];
}

/**
 * Extract skills from job description using AI
 */
async function extractSkillsWithAI(
  jobDescription: string,
  jobTitle: string,
): Promise<JobAnalysisResult> {
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert job market analyst. Extract structured information from job descriptions.

Your task:
1. Identify MUST-HAVE skills (required, essential, mandatory)
2. Identify NICE-TO-HAVE skills (preferred, bonus, advantage, plus)
3. Extract required years of experience
4. Extract education level (if mentioned)
5. Extract language requirements (e.g., Finnish, English)

CRITICAL RULES:
- MUST-HAVE skills: Skills that are explicitly required, essential, or mandatory. Look for phrases like "required", "must have", "essential", "mandatory", "need", "should have".
- NICE-TO-HAVE skills: Skills that are preferred, bonus, or advantageous. Look for phrases like "nice to have", "good to have", "bonus", "preferred", "advantage", "plus", "helpful".
- Normalize skill names (e.g., "React.js" → "React", "Node.js" → "Node.js", "TypeScript" → "TypeScript")
- Use standard skill names from common tech stack
- Extract experience as a number (e.g., "3-5 years" → 3, "5+ years" → 5)
- Education level: "Bachelor's", "Master's", "PhD", "High School", etc.
- Languages: Extract all mentioned languages (e.g., ["Finnish", "English"])

Return JSON with this EXACT structure:
{
  "mustHaveSkills": ["React", "TypeScript", "Node.js"],
  "niceToHaveSkills": ["Docker", "AWS"],
  "experienceYears": 3,
  "educationLevel": "Bachelor's",
  "languageRequirements": ["Finnish", "English"]
}`,
      },
      {
        role: "user",
        content: `Job Title: ${jobTitle}\n\nJob Description:\n${jobDescription}`,
      },
    ],
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error("No response from AI");
  }

  // Parse JSON response
  let parsed: JobAnalysisResult;
  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("[Job Processor] Failed to parse AI response:", response);
    throw new Error("Failed to parse AI response");
  }

  // Validate and normalize
  return {
    mustHaveSkills: Array.isArray(parsed.mustHaveSkills)
      ? parsed.mustHaveSkills
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills)
      ? parsed.niceToHaveSkills
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    experienceYears: typeof parsed.experienceYears === "number" ? parsed.experienceYears : undefined,
    educationLevel: typeof parsed.educationLevel === "string" ? parsed.educationLevel.trim() : undefined,
    languageRequirements: Array.isArray(parsed.languageRequirements)
      ? parsed.languageRequirements
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  };
}

// Use existing embedding utility (already handles Langfuse observation)

/**
 * Normalize skills using skill dictionary
 */
function normalizeSkills(skills: string[]): string[] {
  const normalized = new Set<string>();
  
  for (const skill of skills) {
    const normalizedSkill = skill.trim();
    if (!normalizedSkill) continue;
    
    // Check if skill matches any dictionary entry
    const matched = SKILL_DICTIONARY.find((entry) =>
      entry.patterns.some((pattern) => pattern.test(normalizedSkill))
    );
    
    if (matched) {
      normalized.add(matched.label);
    } else {
      // Keep original if no match (might be a new skill)
      normalized.add(normalizedSkill);
    }
  }
  
  return Array.from(normalized);
}

/**
 * Process a single job with AI
 */
export async function processJobWithAI(jobId: string): Promise<void> {
  // @ts-ignore - Prisma client will be regenerated after schema migration
  const job = await (prisma as any).job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.isProcessed) {
    console.log(`[Job Processor] Job ${jobId} already processed, skipping`);
    return;
  }

  if (!job.descriptionRaw || job.descriptionRaw.trim().length < 50) {
    console.warn(`[Job Processor] Job ${jobId} has no description, skipping`);
    return;
  }

  console.log(`[Job Processor] Processing job ${jobId}: ${job.title}`);

  try {
    const analysis = await extractSkillsWithAI(job.descriptionRaw, job.title);

    // Normalize skills
    const mustHaveSkills = normalizeSkills(analysis.mustHaveSkills);
    const niceToHaveSkills = normalizeSkills(analysis.niceToHaveSkills);

    const embedding = await generateEmbedding(
      job.descriptionRaw.substring(0, 8000),
    );

    // Store analysis using raw SQL since Prisma client needs regeneration
    // Format embedding as PostgreSQL array string for pgvector: [0.1, 0.2, ...]
    const embeddingArray = `[${embedding.join(',')}]`;
    
    await prisma.$executeRaw`
      INSERT INTO "JobAnalysis" (
        "id", "jobId", "mustHaveSkills", "niceToHaveSkills", 
        "experienceYears", "educationLevel", "languageRequirements", 
        "analysisEmbedding", "processedAt"
      )
      VALUES (
        gen_random_uuid(),
        ${job.id}::uuid,
        ${mustHaveSkills}::text[],
        ${niceToHaveSkills}::text[],
        ${analysis.experienceYears ?? null}::integer,
        ${analysis.educationLevel ?? null}::text,
        ${analysis.languageRequirements}::text[],
        ${embeddingArray}::vector(1536),
        NOW()
      )
    `;

    // Mark job as processed
    // @ts-ignore - Prisma client will be regenerated after schema migration
    await (prisma as any).job.update({
      where: { id: jobId },
      data: {
        isProcessed: true,
        processedAt: new Date(),
      },
    });

    console.log(
      `[Job Processor] ✅ Processed job ${jobId}: ${mustHaveSkills.length} must-have, ${niceToHaveSkills.length} nice-to-have skills`,
    );
  } catch (error) {
    console.error(`[Job Processor] ❌ Error processing job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Process multiple unprocessed jobs
 */
export async function processUnprocessedJobs(
  limit: number = 50,
): Promise<{ processed: number; failed: number }> {
  // @ts-ignore - Prisma client will be regenerated after schema migration
  const allUnprocessedJobs = await (prisma as any).job.findMany({
    where: {
      isProcessed: false,
    },
    take: limit * 2, // Get more to filter out empty descriptions
    orderBy: {
      scrapedAt: "desc", // Process newest first
    },
  });
  
  // Filter out jobs with no description
  const unprocessedJobs = allUnprocessedJobs.filter(
    (job: any) => job.descriptionRaw && job.descriptionRaw.trim().length >= 50
  ).slice(0, limit);

  if (unprocessedJobs.length === 0) {
    console.log("[Job Processor] No unprocessed jobs found");
    return { processed: 0, failed: 0 };
  }

  console.log(`[Job Processor] Processing ${unprocessedJobs.length} jobs...`);

  let processed = 0;
  let failed = 0;

  for (const job of unprocessedJobs) {
    try {
      await processJobWithAI(job.id);
      processed++;
      
      // Add small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      failed++;
      console.error(`[Job Processor] Failed to process job ${job.id}:`, error);
      // Continue with next job
    }
  }

  console.log(
    `[Job Processor] Batch complete: ${processed} processed, ${failed} failed`,
  );

  return { processed, failed };
}

