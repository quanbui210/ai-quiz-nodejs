/**
 * Batch script to generate quiz templates for skill mastery phases
 * 
 * This script generates 10-question quizzes for each phase of existing skill templates.
 * 
 * Usage:
 *   npm run generate:skill-quizzes
 *   npm run generate:skill-quizzes -- --skip-existing
 *   npm run generate:skill-quizzes -- --skills=Docker,React
 *   npm run generate:skill-quizzes -- --batch-size=5
 */

import { PrismaClient, QuestionType, Difficulty } from "@prisma/client";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const prisma = new PrismaClient();

const DEFAULT_MODEL =
  "gpt-3.5-turbo";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface QuizQuestion {
  question: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  options?: string[]; // For multiple choice
  correctAnswer: string;
  explanation?: string; // Optional explanation
  points: number;
}

interface QuizGenerationResult {
  questions: QuizQuestion[];
}

const BATCH_SIZE = parseInt(
  process.env.BATCH_SIZE ||
    process.argv.find((arg) => arg.startsWith("--batch-size"))?.split("=")[1] ||
    "5",
  10,
);
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const SPECIFIC_SKILLS = process.argv
  .find((arg) => arg.startsWith("--skills"))
 ?.split("=")[1]
  ?.split(",")
  .map((s) => s.trim());

interface GenerationStats {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  errors: Array<{ skill: string; phase: number; error: string }>;
}

function safeJsonParse<T>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function generateQuizForPhase(
  skillName: string,
  phase: number,
  phaseData: {
    title: string;
    focus: string;
    tasks: Array<{
      title: string;
      description?: string;
      theory?: { content?: string; keyPoints?: string[] };
      concepts?: string[];
      examples?: Array<{ type: string; explanation?: string }>;
    }>;
  },
): Promise<{ success: boolean; questions?: QuizQuestion[]; error?: string }> {
  try {
    // Check if quiz template already exists
    const existing = await prisma.skillMasteryQuizTemplate.findUnique({
      where: {
        skillName_phase: {
          skillName,
          phase,
        },
      },
    });

    if (existing && SKIP_EXISTING) {
      console.log(
        `Skipping ${skillName} Phase ${phase} quiz - already exists`,
      );
      return { success: true };
    }

    console.log(`\nGenerating quiz: ${skillName} - Phase ${phase}`);

    // Extract phase content for quiz generation
    const phaseTheory = phaseData.tasks
      .map((t) => t.theory?.content)
      .filter(Boolean)
      .join("\n\n");
    const phaseConcepts = phaseData.tasks
      .flatMap((t) => t.concepts || [])
      .filter(Boolean);
    const phaseExamples = phaseData.tasks
      .flatMap((t) => t.examples || [])
      .map((e) => e.explanation)
      .filter(Boolean);

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.6,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a quiz generator for skill mastery learning. Generate a 10-question quiz for Phase ${phase} of mastering ${skillName}.

Phase Information:
- Title: ${phaseData.title}
- Focus: ${phaseData.focus}
- Tasks: ${phaseData.tasks.map((t) => t.title).join(", ")}

Phase Content:
${phaseTheory ? `Theory:\n${phaseTheory.substring(0, 2000)}\n\n` : ""}
${phaseConcepts.length > 0 ? `Key Concepts: ${phaseConcepts.join(", ")}\n\n` : ""}
${phaseExamples.length > 0 ? `Examples: ${phaseExamples.slice(0, 3).join("\n")}\n` : ""}

Generate a quiz with exactly 10 questions that test understanding of:
1. Core concepts from the theory
2. Practical application from examples
3. Key terminology and definitions
4. Understanding of phase focus and tasks

Question Distribution:
- 6 Multiple Choice questions (4 options each)
- 2 True/False questions
- 2 Short Answer questions (1-2 sentences expected)

Return JSON with this exact structure:
{
  "questions": [
    {
      "question": "Question text",
      "type": "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER",
      "options": ["Option A", "Option B", "Option C", "Option D"], // Only for MULTIPLE_CHOICE
      "correctAnswer": "Correct answer (option text for MCQ, true/false for T/F, answer text for short answer)",
      "explanation": "Why this answer is correct (2-3 sentences)",
      "points": 10
    }
  ]
}

IMPORTANT:
- All questions must be based on the phase content provided
- Questions should be at INTERMEDIATE to ADVANCED difficulty
- Multiple choice questions should have exactly 4 options
- Correct answers must match exactly (case-sensitive for short answers)
- Explanations should be educational and help the learner understand`,
        },
        {
          role: "user",
          content: `Generate a 10-question quiz for Phase ${phase} of ${skillName}.`,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error("No response from OpenAI");
    }

    const parsed = safeJsonParse<QuizGenerationResult>(response);
    if (!parsed || !parsed.questions || parsed.questions.length !== 10) {
      throw new Error(
        `Invalid quiz format. Expected 10 questions, got ${parsed?.questions?.length || 0}`,
      );
    }

    // Validate and normalize questions
    const validatedQuestions = parsed.questions.map((q, idx) => {
      if (!q.question || !q.correctAnswer) {
        throw new Error(`Question ${idx + 1} missing required fields`);
      }

      // Normalize type
      let questionType: QuestionType = QuestionType.MULTIPLE_CHOICE;
      if (q.type === "TRUE_FALSE") {
        questionType = QuestionType.TRUE_FALSE;
      } else if (q.type === "SHORT_ANSWER") {
        questionType = QuestionType.SHORT_ANSWER;
      }

      // Validate multiple choice has options
      if (questionType === QuestionType.MULTIPLE_CHOICE && !q.options) {
        throw new Error(`Question ${idx + 1} (MULTIPLE_CHOICE) missing options`);
      }

      return {
        question: q.question,
        type: questionType,
        options: q.options || undefined,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || undefined,
        points: q.points || 10,
        order: idx,
      };
    });

    // Save quiz template
    await prisma.skillMasteryQuizTemplate.upsert({
      where: {
        skillName_phase: {
          skillName,
          phase,
        },
      },
      create: {
        skillName,
        phase,
        title: `${skillName} - Phase ${phase} Quiz`,
        description: `Quiz for Phase ${phase}: ${phaseData.title}`,
        difficulty: Difficulty.INTERMEDIATE,
        isActive: true,
        version: existing ? existing.version + 1 : 1,
        questions: {
          create: validatedQuestions,
        },
      },
      update: {
        title: `${skillName} - Phase ${phase} Quiz`,
        description: `Quiz for Phase ${phase}: ${phaseData.title}`,
        version: existing ? existing.version + 1 : 1,
        updatedAt: new Date(),
        questions: {
          deleteMany: {},
          create: validatedQuestions,
        },
      },
    });

    console.log(
      `Generated quiz: ${skillName} Phase ${phase} (10 questions)`,
    );
    return { success: true, questions: validatedQuestions };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(
      `Failed: ${skillName} Phase ${phase} - ${errorMsg}`,
    );
    return { success: false, error: errorMsg };
  }
}

async function generateQuizzesBatch(
  stats: GenerationStats,
): Promise<void> {
  // Get all active skill templates
  const templates = await prisma.skillMasteryTemplate.findMany({
    where: { isActive: true },
    select: {
      skillName: true,
      roadmapPlan: true,
    },
  });

  // Filter by specific skills if provided
  const filteredTemplates = SPECIFIC_SKILLS
    ? templates.filter((t) => SPECIFIC_SKILLS.includes(t.skillName))
    : templates;

  if (filteredTemplates.length === 0) {
    console.error("No skill templates found");
    process.exit(1);
  }

  // Build list of phase-quiz combinations
  const combinations: Array<{ skillName: string; phase: number; phaseData: any }> = [];

  for (const template of filteredTemplates) {
    const plan = template.roadmapPlan as any;
    if (plan && plan.phases && Array.isArray(plan.phases)) {
      for (const phase of plan.phases) {
        if (phase.phase && phase.tasks && phase.tasks.length > 0) {
          combinations.push({
            skillName: template.skillName,
            phase: phase.phase,
            phaseData: {
              title: phase.title || `Phase ${phase.phase}`,
              focus: phase.focus || "",
              tasks: phase.tasks || [],
            },
          });
        }
      }
    }
  }

  stats.total = combinations.length;

  // Filter out existing quizzes if --skip-existing
  let pendingCombinations = combinations;
  if (SKIP_EXISTING) {
    console.log("\nChecking which quizzes already exist...");
    const existingQuizzes = await prisma.skillMasteryQuizTemplate.findMany({
      where: { isActive: true },
      select: {
        skillName: true,
        phase: true,
      },
    });

    const existingSet = new Set(
      existingQuizzes.map((q) => `${q.skillName}|${q.phase}`),
    );

    pendingCombinations = combinations.filter(
      ({ skillName, phase }) =>
        !existingSet.has(`${skillName}|${phase}`),
    );

    const existingCount = combinations.length - pendingCombinations.length;
    console.log(`   Found ${existingCount} existing quizzes`);
    console.log(`   ${pendingCombinations.length} quizzes remaining to generate`);
  }

  if (pendingCombinations.length === 0) {
    console.log("\nAll quizzes already exist! Nothing to generate.");
    stats.skipped = stats.total;
    return;
  }

  console.log(`\nTotal quizzes to generate: ${stats.total}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Skip existing: ${SKIP_EXISTING}`);
  if (SPECIFIC_SKILLS) {
    console.log(`Specific skills: ${SPECIFIC_SKILLS.join(", ")}`);
  }
  console.log("\n" + "=".repeat(60));

  // Process in batches
  const toProcess = pendingCombinations.slice(0, BATCH_SIZE);
  const totalBatches = Math.ceil(pendingCombinations.length / BATCH_SIZE);
  const currentBatch = 1;

  console.log(
    `\nProcessing batch ${currentBatch}/${totalBatches} (${toProcess.length} quizzes)`,
  );

  // Process sequentially to avoid rate limits
  for (let idx = 0; idx < toProcess.length; idx++) {
    const item = toProcess[idx];
    if (!item) continue;

    const { skillName, phase, phaseData } = item;

    const result = await generateQuizForPhase(skillName, phase, phaseData);

    if (result.success) {
      if (result.error === undefined) {
        stats.generated++;
      } else {
        stats.skipped++;
      }
    } else {
      stats.failed++;
      stats.errors.push({
        skill: skillName,
        phase,
        error: result.error || "Unknown error",
      });
    }

    // Small delay between generations (except for last one)
    if (idx < toProcess.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
    }
  }

  // Show remaining count
  const remaining = pendingCombinations.length - toProcess.length;
  if (remaining > 0) {
    console.log(`\n${remaining} quizzes remaining. Run the script again to continue.`);
  }
}

async function main() {
  try {
    console.log("Starting skill mastery quiz generation...\n");

    const stats: GenerationStats = {
      total: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    await generateQuizzesBatch(stats);

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("Generation Summary:");
    console.log(`   Total quizzes: ${stats.total}`);
    console.log(`   Generated: ${stats.generated}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Failed: ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of stats.errors) {
        console.log(
          `   - ${err.skill} Phase ${err.phase}: ${err.error}`,
        );
      }
    }

    console.log("\nDone!");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

