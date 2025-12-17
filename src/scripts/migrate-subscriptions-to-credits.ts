import prisma from "../utils/prisma";

const PLAN_CREDIT_MAPPING: Record<string, { creditsPerMonth: number; maxRolloverCredits: number }> = {
  "Free": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "free": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "default": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "Pro": { creditsPerMonth: 100, maxRolloverCredits: 50 },
  "pro": { creditsPerMonth: 100, maxRolloverCredits: 50 },
  "Premium": { creditsPerMonth: 200, maxRolloverCredits: 100 },
  "premium": { creditsPerMonth: 200, maxRolloverCredits: 100 },
};


function determineCreditAllocation(
  planName: string,
  existingLimits: {
    maxCareerRoadmaps: number;
    maxQuizzes: number;
    maxTopics: number;
  }
): { creditsPerMonth: number; maxRolloverCredits: number } {
  // First, try to match by plan name
  const normalizedName = planName.trim();
  if (PLAN_CREDIT_MAPPING[normalizedName]) {
    return PLAN_CREDIT_MAPPING[normalizedName];
  }

  if (existingLimits.maxCareerRoadmaps >= 10 || existingLimits.maxQuizzes >= 100) {
    return { creditsPerMonth: 200, maxRolloverCredits: 100 };
  }
  if (existingLimits.maxCareerRoadmaps >= 5 || existingLimits.maxQuizzes >= 50) {
    return { creditsPerMonth: 100, maxRolloverCredits: 50 };
  }

  return { creditsPerMonth: 50, maxRolloverCredits: 0 };
}

async function migrateSubscriptions() {
  console.log("🔄 Starting subscription credit migration...\n");

  try {
    const subscriptions = await prisma.userSubscription.findMany({
      include: {
        plan: true,
      },
    });

    console.log(`Found ${subscriptions.length} subscriptions to migrate\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const sub of subscriptions) {
      try {
        // Determine credit allocation based on plan
        const { creditsPerMonth, maxRolloverCredits } = determineCreditAllocation(
          sub.plan.name,
          {
            maxCareerRoadmaps: sub.maxCareerRoadmaps,
            maxQuizzes: sub.maxQuizzes,
            maxTopics: sub.maxTopics,
          }
        );

        if (sub.creditsPerMonth === creditsPerMonth && sub.maxRolloverCredits === maxRolloverCredits) {
          console.log(`⏭️  Skipping user ${sub.userId} - credits already correct (${sub.creditsPerMonth} credits/month for ${sub.plan.name})`);
          skipped++;
          continue;
        }

      
        const estimatedCreditsUsed = 
          (sub.maxCareerRoadmaps > 0 ? 8 : 0) + 
          (sub.maxQuizzes > 0 ? 2 : 0); 

        const currentCredits = Math.max(0, creditsPerMonth - estimatedCreditsUsed);

        const now = new Date();
        const currentPeriodStart = sub.currentPeriodStart || now;
        const currentPeriodEnd = sub.currentPeriodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Update subscription
        await prisma.userSubscription.update({
          where: { id: sub.id },
          data: {
            creditsPerMonth,
            currentCredits: creditsPerMonth, // Give full credits on migration
            maxRolloverCredits,
            creditsUsedThisMonth: 0,
            totalCreditsUsed: 0,
            currentPeriodStart,
            currentPeriodEnd,
          },
        });

        console.log(`✅ Migrated user ${sub.userId}: ${creditsPerMonth} credits/month (plan: ${sub.plan.name})`);
        migrated++;
      } catch (error: any) {
        console.error(`❌ Error migrating user ${sub.userId}:`, error.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 Migration Summary:");
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log("=".repeat(50));

    if (errors === 0) {
      console.log("\n🎉 Migration completed successfully!");
    } else {
      console.log(`\n⚠️  Migration completed with ${errors} error(s). Please review the logs above.`);
    }
  } catch (error: any) {
    console.error("❌ Fatal error during migration:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateSubscriptions();

