import prisma from "../utils/prisma";
import { Feature, DEFAULT_CREDIT_COSTS } from "../services/credit.service";

async function seedCreditPricing() {
  console.log("🌱 Seeding CreditPricing table...");

  const features = Object.entries(DEFAULT_CREDIT_COSTS);

  for (const [feature, creditCost] of features) {
    const featureDescriptions: Record<string, string> = {
      [Feature.QUIZ_GENERATION]: "Generate a quiz with multiple questions",
      [Feature.DOCUMENT_ANALYSIS]: "Analyze and extract insights from a document",
      [Feature.JOB_MATCHING]: "Match your profile with 20+ job postings",
      [Feature.SKILL_MASTERY_ROADMAP]: "Generate a skill mastery learning roadmap",
      [Feature.CAREER_ROADMAP]: "Generate a comprehensive career transition roadmap",
      [Feature.INTERVIEW_SESSION]: "Interactive AI interview practice session",
    };

    await prisma.creditPricing.upsert({
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

    console.log(`✅ ${feature}: ${creditCost} credits`);
  }

  console.log("✅ CreditPricing seeding completed!");
}

async function migrateExistingUsers() {
  console.log("🔄 Migrating existing users to credit system...");

  // Get all users without credit fields set
  const users = await prisma.userSubscription.findMany({
    where: {
      OR: [
        { currentCredits: 0 },
        { creditsPerMonth: 0 },
      ],
    },
  });

  console.log(`Found ${users.length} users to migrate`);

  for (const subscription of users) {
    // Determine credits based on plan
    let creditsPerMonth = 50; // Default free tier
    let maxRolloverCredits = 0;

    // Check if user has a paid plan (you can adjust this logic based on your plan structure)
    if (subscription.maxQuizzes > 10 || subscription.maxCareerRoadmaps > 1) {
      creditsPerMonth = 200; // Starter tier
      maxRolloverCredits = 50;
    }

    await prisma.userSubscription.update({
      where: { id: subscription.id },
      data: {
        creditsPerMonth,
        currentCredits: creditsPerMonth, // Give them full credits on migration
        maxRolloverCredits,
        creditsUsedThisMonth: 0,
        totalCreditsUsed: 0,
      },
    });

    console.log(`✅ Migrated user ${subscription.userId}: ${creditsPerMonth} credits/month`);
  }

  console.log("✅ User migration completed!");
}

async function main() {
  try {
    await seedCreditPricing();
    await migrateExistingUsers();
    console.log("\n🎉 All seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

