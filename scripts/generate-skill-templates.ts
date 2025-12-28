/**
 * Batch script to pre-generate skill mastery roadmaps
 * 
 * Usage:
 *   npm run generate-skill-templates
 *   npm run generate-skill-templates -- --batch-size=10
 *   npm run generate-skill-templates -- --skip-existing
 *   npm run generate-skill-templates -- --skills=Docker,React,Node.js
 */

import { PrismaClient, SkillLevel } from "@prisma/client";
import { generateSkillMasteryRoadmap, SkillMasteryInput } from "../src/modules/skill-mastery/skill-mastery.service";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// Load skills data
const skillsDataPath = path.join(__dirname, "skills-to-generate.json");
const skillsDataRaw = JSON.parse(fs.readFileSync(skillsDataPath, "utf-8"));

interface SkillConfig {
  name: string;
  category: string;
  targetLevels: string[];
  includeCertification: boolean[] | null; // null means let LLM decide
}

interface SkillsData {
  skills: SkillConfig[];
}

const skillsData = skillsDataRaw as SkillsData;

interface GenerationStats {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  errors: Array<{ skill: string; level: string; cert: string | boolean; error: string }>;
}

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || process.argv.find(arg => arg.startsWith("--batch-size"))?.split("=")[1] || "10", 10);
const SKIP_EXISTING = process.argv.includes("--skip-existing");
// Parse --skills argument, handling spaces in skill names
const skillsArg = process.argv.find(arg => arg.startsWith("--skills"));
const SPECIFIC_SKILLS = skillsArg 
  ? skillsArg.split("=").slice(1).join("=").split(",").map(s => s.trim()).filter(s => s.length > 0)
  : undefined;

async function generateTemplate(
  skillName: string,
  category: string,
  targetLevel: SkillLevel,
  includeCertification: boolean | null | undefined,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if template already exists
    // Use false if null/undefined for lookup (since we store false when LLM decides)
    const certValue = includeCertification ?? false;
    const existing = await prisma.skillMasteryTemplate.findUnique({
      where: {
        skillName_targetLevel_includeCertification: {
          skillName,
          targetLevel,
          includeCertification: certValue,
        },
      },
    });

    const certLabel = includeCertification === null || includeCertification === undefined ? "LLM decides" : String(includeCertification);
    
    if (existing && SKIP_EXISTING) {
      console.log(`Skipping ${skillName} (${targetLevel}, cert: ${certLabel}) - already exists`);
      return { success: true };
    }

    if (existing) {
      console.log(`Template exists for ${skillName} (${targetLevel}, cert: ${certLabel}), regenerating...`);
    }

    console.log(`\nGenerating: ${skillName} -> ${targetLevel} (certification: ${certLabel})`);

    // Generate roadmap
    // If includeCertification is null/undefined, let LLM decide
    const input: SkillMasteryInput = {
      skillName,
      targetLevel: targetLevel as "INTERMEDIATE" | "ADVANCED" | "EXPERT",
      currentLevel: null, // Templates are generic, not personalized
      includeCertification: includeCertification ?? undefined, // null becomes undefined, let LLM decide
      useWebSearch: true, // Use Tavily for up-to-date resources
    };

    const roadmap = await generateSkillMasteryRoadmap(input);

    // Save as template (certValue already defined above)
    await prisma.skillMasteryTemplate.upsert({
      where: {
        skillName_targetLevel_includeCertification: {
          skillName,
          targetLevel,
          includeCertification: certValue,
        },
      },
      create: {
        skillName,
        skillCategory: category,
        targetLevel,
        includeCertification: certValue,
        roadmapPlan: roadmap as any,
        overview: roadmap.overview,
        totalWeeks: roadmap.totalWeeks,
        isActive: true,
        version: existing ? existing.version + 1 : 1,
      },
      update: {
        roadmapPlan: roadmap as any,
        overview: roadmap.overview,
        totalWeeks: roadmap.totalWeeks,
        version: existing ? existing.version + 1 : 1,
        updatedAt: new Date(),
      },
    });

    console.log(`Generated: ${skillName} (${targetLevel}, cert: ${certLabel}) - ${roadmap.totalWeeks} weeks`);
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`Failed: ${skillName} (${targetLevel}, cert: ${includeCertification}) - ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

async function generateTemplatesBatch(
  skills: SkillConfig[],
  stats: GenerationStats,
): Promise<void> {
  const combinations: Array<{ skill: SkillConfig; level: string; cert: boolean | null }> = [];

  // Build all combinations
  for (const skill of skills) {
    for (const level of skill.targetLevels) {
      // If includeCertification is null, generate one template (LLM decides)
      // Otherwise, generate for each cert option
      if (skill.includeCertification === null) {
        combinations.push({ skill, level, cert: null });
      } else {
        for (const cert of skill.includeCertification) {
          combinations.push({ skill, level, cert });
        }
      }
    }
  }

  stats.total = combinations.length;

  // Filter out existing templates if --skip-existing is used
  // This way, each run only processes missing templates
  let pendingCombinations = combinations;
  if (SKIP_EXISTING) {
    console.log("\nChecking which templates already exist...");
    const existingTemplates = await prisma.skillMasteryTemplate.findMany({
      where: { isActive: true },
      select: {
        skillName: true,
        targetLevel: true,
        includeCertification: true,
      },
    });

    const existingSet = new Set(
      existingTemplates.map(
        (t) => `${t.skillName}|${t.targetLevel}|${t.includeCertification}`,
      ),
    );

    pendingCombinations = combinations.filter(({ skill, level, cert }) => {
      const key = `${skill.name}|${level}|${cert}`;
      return !existingSet.has(key);
    });

    const existingCount = combinations.length - pendingCombinations.length;
    console.log(`   Found ${existingCount} existing templates`);
    console.log(`   ${pendingCombinations.length} templates remaining to generate`);
  }

  if (pendingCombinations.length === 0) {
    console.log("\nAll templates already exist! Nothing to generate.");
    stats.skipped = stats.total;
    return;
  }

  console.log(`\nTotal combinations: ${stats.total}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Skip existing: ${SKIP_EXISTING}`);
  if (SPECIFIC_SKILLS) {
    console.log(`Specific skills (${SPECIFIC_SKILLS.length}): ${SPECIFIC_SKILLS.join(", ")}`);
    console.log(`   Filtered skills found: ${skills.length}`);
  }
  console.log("\n" + "=".repeat(60));

  // Process only up to BATCH_SIZE templates (or all if less)
  const toProcess = pendingCombinations.slice(0, BATCH_SIZE);
  const totalBatches = Math.ceil(pendingCombinations.length / BATCH_SIZE);
  const currentBatch = 1;

  console.log(`\nProcessing batch ${currentBatch}/${totalBatches} (${toProcess.length} templates)`);

  // Process sequentially to avoid rate limits
  for (let idx = 0; idx < toProcess.length; idx++) {
    const item = toProcess[idx];
    if (!item) continue;

    const { skill, level, cert } = item;

    if (SPECIFIC_SKILLS && !SPECIFIC_SKILLS.includes(skill.name)) {
      stats.skipped++;
      continue;
    }

      const result = await generateTemplate(
        skill.name,
        skill.category,
        level as SkillLevel,
        cert === null ? undefined : (cert as boolean),
      );

    if (result.success) {
      if (result.error === undefined) {
        stats.generated++;
      } else {
        stats.skipped++;
      }
    } else {
      stats.failed++;
        stats.errors.push({
          skill: skill.name,
          level,
          cert: cert === null ? "LLM decides" : String(cert),
          error: result.error || "Unknown error",
        });
    }

    if (idx < toProcess.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
    }
  }

  const remaining = pendingCombinations.length - toProcess.length;
  if (remaining > 0) {
    console.log(`\n${remaining} templates remaining. Run the script again to continue.`);
  }
}

async function main() {
  try {
    console.log("Starting skill mastery template generation...\n");

    const skills: SkillConfig[] = SPECIFIC_SKILLS
      ? skillsData.skills.filter((s) => SPECIFIC_SKILLS.includes(s.name))
      : skillsData.skills;

    if (skills.length === 0) {
      console.error("No skills found to generate");
      if (SPECIFIC_SKILLS) {
        console.error(`   Requested skills: ${SPECIFIC_SKILLS.join(", ")}`);
        console.error(`   Available skills in JSON: ${skillsData.skills.map(s => s.name).join(", ")}`);
        console.error("\n   Tip: Check for exact name matches (case-sensitive, no extra spaces)");
      }
      process.exit(1);
    }

    if (SPECIFIC_SKILLS && skills.length < SPECIFIC_SKILLS.length) {
      const foundNames = skills.map(s => s.name);
      const notFound = SPECIFIC_SKILLS.filter(name => !foundNames.includes(name));
      if (notFound.length > 0) {
        console.warn(`Warning: ${notFound.length} skill(s) not found in JSON: ${notFound.join(", ")}`);
        console.warn(`   Found ${skills.length} matching skill(s): ${foundNames.join(", ")}`);
      }
    }

    const stats: GenerationStats = {
      total: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    await generateTemplatesBatch(skills, stats);

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("Generation Summary:");
    console.log(`   Total combinations: ${stats.total}`);
    console.log(`   Generated: ${stats.generated}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Failed: ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of stats.errors) {
        console.log(`   - ${err.skill} (${err.level}, cert: ${err.cert}): ${err.error}`);
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

