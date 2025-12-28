/**
 * Migration Script: Skill Normalization
 * 
 * This script migrates the database to use a normalized Skill table instead of
 * storing skill names as strings in multiple tables.
 * 
 * Steps:
 * 1. Extract all unique skill names from existing data
 * 2. Create Skill records
 * 3. Update foreign keys in SkillMasteryTemplate, SkillMasteryGoal, SkillMasteryQuizTemplate
 * 4. Remove old skillName columns (handled by Prisma migration)
 * 
 * Run this AFTER running: npx prisma migrate dev --name add_skill_normalization
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SkillData {
  name: string;
  category?: string;
}

async function migrateSkillNormalization() {
  console.log("Starting Skill Normalization Migration...\n");

  try {
    console.log("Step 1: Extracting unique skill names...");

    const templateSkills = await prisma.skillMasteryTemplate.findMany({
      select: {
        skillName: true,
        skillCategory: true,
      },
      where: {
        skillName: { not: null },
      },
      distinct: ["skillName"],
    });

    // Get unique skills from goals
    const goalSkills = await prisma.skillMasteryGoal.findMany({
      select: {
        skillName: true,
        skillCategory: true,
      },
      where: {
        skillName: { not: null },
      },
      distinct: ["skillName"],
    });

    // Get unique skills from quiz templates
    const quizTemplateSkills = await prisma.skillMasteryQuizTemplate.findMany({
      select: {
        skillName: true,
      },
      where: {
        skillName: { not: null },
      },
      distinct: ["skillName"],
    });

    // Combine and deduplicate
    const skillMap = new Map<string, SkillData>();

    templateSkills.forEach((s) => {
      if (!s.skillName) return; // Skip if skillName is null
      if (!skillMap.has(s.skillName)) {
        skillMap.set(s.skillName, {
          name: s.skillName,
          category: s.skillCategory || undefined,
        });
      } else {
        // Update category if template has one and existing doesn't
        const existing = skillMap.get(s.skillName)!;
        if (s.skillCategory && !existing.category) {
          existing.category = s.skillCategory;
        }
      }
    });

    goalSkills.forEach((s) => {
      if (!s.skillName) return; // Skip if skillName is null
      if (!skillMap.has(s.skillName)) {
        skillMap.set(s.skillName, {
          name: s.skillName,
          category: s.skillCategory || undefined,
        });
      } else {
        const existing = skillMap.get(s.skillName)!;
        if (s.skillCategory && !existing.category) {
          existing.category = s.skillCategory;
        }
      }
    });

    quizTemplateSkills.forEach((s) => {
      if (!s.skillName) return; // Skip if skillName is null
      if (!skillMap.has(s.skillName)) {
        skillMap.set(s.skillName, {
          name: s.skillName,
        });
      }
    });

    const uniqueSkills = Array.from(skillMap.values());
    console.log(`   Found ${uniqueSkills.length} unique skills\n`);

    // Step 2: Create Skill records
    console.log("Step 2: Creating Skill records...");
    const skillRecords = new Map<string, string>(); // skillName -> skillId

    for (const skillData of uniqueSkills) {
      // Check if skill already exists (in case migration is run multiple times)
      let skill = await prisma.skill.findUnique({
        where: { name: skillData.name },
      });

      if (!skill) {
        skill = await prisma.skill.create({
          data: {
            name: skillData.name,
            category: skillData.category,
          },
        });
        console.log(`   Created: ${skillData.name}`);
      } else {
        // Update category if needed
        if (skillData.category && !skill.category) {
          skill = await prisma.skill.update({
            where: { id: skill.id },
            data: { category: skillData.category },
          });
          console.log(`   Updated category: ${skillData.name}`);
        } else {
          console.log(`   - Already exists: ${skillData.name}`);
        }
      }

      skillRecords.set(skillData.name, skill.id);
    }

    console.log(`\n   Total skills: ${skillRecords.size}\n`);

    // Step 3: Update SkillMasteryTemplate foreign keys
    console.log("Step 3: Updating SkillMasteryTemplate foreign keys...");
    const templates = await prisma.skillMasteryTemplate.findMany({
      select: { id: true, skillName: true },
      where: {
        skillName: { not: null },
      },
    });

    let updatedTemplates = 0;
    for (const template of templates) {
      if (!template.skillName) {
        console.warn(`   Skipping template ${template.id} - skillName is null`);
        continue;
      }
      const skillId = skillRecords.get(template.skillName);
      if (!skillId) {
        console.error(`   ERROR: No skill found for: ${template.skillName}`);
        continue;
      }

      // Check if already updated (in case migration is run multiple times)
      const existing = await prisma.skillMasteryTemplate.findUnique({
        where: { id: template.id },
        select: { skillId: true },
      });

      if (!existing?.skillId) {
        await prisma.skillMasteryTemplate.update({
          where: { id: template.id },
          data: { skillId },
        });
        updatedTemplates++;
      }
    }
    console.log(`   Updated ${updatedTemplates} templates\n`);

    // Step 4: Update SkillMasteryGoal foreign keys
    console.log("Step 4: Updating SkillMasteryGoal foreign keys...");
    const goals = await prisma.skillMasteryGoal.findMany({
      select: { id: true, skillName: true },
      where: {
        skillName: { not: null },
      },
    });

    let updatedGoals = 0;
    for (const goal of goals) {
      if (!goal.skillName) {
        console.warn(`   Skipping goal ${goal.id} - skillName is null`);
        continue;
      }
      const skillId = skillRecords.get(goal.skillName);
      if (!skillId) {
        console.error(`   ERROR: No skill found for: ${goal.skillName}`);
        continue;
      }

      // Check if already updated
      const existing = await prisma.skillMasteryGoal.findUnique({
        where: { id: goal.id },
        select: { skillId: true },
      });

      if (!existing?.skillId) {
        await prisma.skillMasteryGoal.update({
          where: { id: goal.id },
          data: { skillId },
        });
        updatedGoals++;
      }
    }
    console.log(`   Updated ${updatedGoals} goals\n`);

    // Step 4.5: Backfill skillName for goals that have skillId but null skillName
    const goalsWithSkillId = await prisma.skillMasteryGoal.findMany({
      select: { id: true, skillId: true, skillName: true },
      where: {
        skillId: { not: null },
        skillName: null,
      },
    });

    let backfilledGoals = 0;
    for (const goal of goalsWithSkillId) {
      if (!goal.skillId) continue;
      
      const skill = await prisma.skill.findUnique({
        where: { id: goal.skillId },
        select: { name: true },
      });

      if (skill) {
        await prisma.skillMasteryGoal.update({
          where: { id: goal.id },
          data: { skillName: skill.name },
        });
        backfilledGoals++;
      } else {
        console.warn(`   Skipping goal ${goal.id} - skillId ${goal.skillId} not found`);
      }
    }
    console.log(`   Backfilled ${backfilledGoals} goals\n`);

    // Step 5: Update SkillMasteryQuizTemplate foreign keys
    console.log("Step 5: Updating SkillMasteryQuizTemplate foreign keys...");
    const quizTemplates = await prisma.skillMasteryQuizTemplate.findMany({
      select: { id: true, skillName: true },
      where: {
        skillName: { not: null },
      },
    });

    let updatedQuizTemplates = 0;
    for (const quizTemplate of quizTemplates) {
      if (!quizTemplate.skillName) {
        console.warn(`   Skipping quiz template ${quizTemplate.id} - skillName is null`);
        continue;
      }
      const skillId = skillRecords.get(quizTemplate.skillName);
      if (!skillId) {
        console.error(`   ERROR: No skill found for: ${quizTemplate.skillName}`);
        continue;
      }

      // Check if already updated
      const existing = await prisma.skillMasteryQuizTemplate.findUnique({
        where: { id: quizTemplate.id },
        select: { skillId: true },
      });

      if (!existing?.skillId) {
        await prisma.skillMasteryQuizTemplate.update({
          where: { id: quizTemplate.id },
          data: { skillId },
        });
        updatedQuizTemplates++;
      }
    }
    console.log(`   Updated ${updatedQuizTemplates} quiz templates\n`);

    // Step 6: Link Quiz Templates to Roadmap Templates
    console.log("Step 6: Linking Quiz Templates to Roadmap Templates...");
    const allQuizTemplates = await prisma.skillMasteryQuizTemplate.findMany({
      select: { id: true, skillId: true, phase: true },
    });

    let linkedQuizzes = 0;
    for (const quizTemplate of allQuizTemplates) {
      // Find matching roadmap template
      const roadmapTemplate = await prisma.skillMasteryTemplate.findFirst({
        where: {
          skillId: quizTemplate.skillId,
          isActive: true,
        },
        orderBy: { version: "desc" }, // Get latest version
      });

      if (roadmapTemplate) {
        // Check if already linked
        const existing = await prisma.skillMasteryQuizTemplate.findUnique({
          where: { id: quizTemplate.id },
          select: { templateId: true },
        });

        if (!existing?.templateId) {
          await prisma.skillMasteryQuizTemplate.update({
            where: { id: quizTemplate.id },
            data: { templateId: roadmapTemplate.id },
          });
          linkedQuizzes++;
        }
      }
    }
    console.log(`   Linked ${linkedQuizzes} quiz templates to roadmap templates\n`);

    console.log("Migration completed successfully!\n");
    console.log("Next steps:");
    console.log("   1. Run: npx prisma migrate dev --name remove_skill_name_columns");
    console.log("   2. This will remove the old skillName columns");
    console.log("   3. Update your application code to use skillId instead of skillName\n");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateSkillNormalization()
  .then(() => {
    console.log("Migration script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });

