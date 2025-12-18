import prisma from "../utils/prisma";
import { Feature, DEFAULT_CREDIT_COSTS } from "../services/credit.service";

/**
 * Production Seed Script for Credit Pricing
 * 
 * This script seeds the CreditPricing table with default feature costs.
 * Run after applying PRODUCTION_CREDIT_MIGRATION.sql
 */

async function seedCreditPricing() {
  console.log("🌱 Seeding CreditPricing table for production...\n");

  const features = Object.entries(DEFAULT_CREDIT_COSTS);

  const featureDescriptions: Record<string, string> = {
    [Feature.QUIZ_GENERATION]: "Generate a quiz with multiple questions",
    [Feature.DOCUMENT_ANALYSIS]: "Analyze and extract insights from a document",
    [Feature.JOB_MATCHING]: "Match your profile with 20+ job postings",
    [Feature.SKILL_MASTERY_ROADMAP]: "Generate a skill mastery learning roadmap",
    [Feature.CAREER_ROADMAP]: "Generate a comprehensive career transition roadmap",
    [Feature.INTERVIEW_SESSION]: "Interactive AI interview practice session",
  };

  let created = 0;
  let updated = 0;

  for (const [feature, creditCost] of features) {
    try {
      const result = await prisma.creditPricing.upsert({
        where: { feature },
        create: {
          feature,
          creditCost,
          description: featureDescriptions[feature] || `Use ${feature} feature`,
          isActive: true,
        },
        update: {
          creditCost,
          description: featureDescriptions[feature] || `Use ${feature} feature`,
          isActive: true,
        },
      });

      if (result) {
        const wasCreated = await prisma.creditPricing.findUnique({
          where: { feature },
        });
        if (wasCreated && wasCreated.createdAt.getTime() === wasCreated.updatedAt.getTime()) {
          created++;
          console.log(`✅ Created: ${feature} - ${creditCost} credits`);
        } else {
          updated++;
          console.log(`🔄 Updated: ${feature} - ${creditCost} credits`);
        }
      }
    } catch (error: any) {
      console.error(`❌ Error seeding ${feature}:`, error.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Seeding Summary:");
  console.log(`   ✅ Created: ${created}`);
  console.log(`   🔄 Updated: ${updated}`);
  console.log("=".repeat(60));
  console.log("\n🎉 CreditPricing seeding completed!");
}

async function main() {
  try {
    await seedCreditPricing();
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();


