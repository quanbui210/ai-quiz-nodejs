import prisma from "../utils/prisma";

/**
 * Production Migration Script for Credit System
 * 
 * This script:
 * 1. Migrates all existing subscriptions to credit system
 * 2. Sets correct credit allocations based on plan names
 * 3. Initializes credit balances for all users
 * 
 * Run after applying PRODUCTION_CREDIT_MIGRATION.sql
 */

const PLAN_CREDIT_MAPPING: Record<string, { creditsPerMonth: number; maxRolloverCredits: number }> = {
  "Free": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "free": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "default": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "Pro": { creditsPerMonth: 100, maxRolloverCredits: 50 },
  "pro": { creditsPerMonth: 100, maxRolloverCredits: 50 },
  "Premium": { creditsPerMonth: 200, maxRolloverCredits: 100 },
  "premium": { creditsPerMonth: 200, maxRolloverCredits: 100 },
};

function getCreditAllocation(planName: string): { creditsPerMonth: number; maxRolloverCredits: number } {
  const normalizedName = planName.trim();
  if (PLAN_CREDIT_MAPPING[normalizedName]) {
    return PLAN_CREDIT_MAPPING[normalizedName];
  }

  // Fallback: check if plan name contains keywords
  const lowerName = normalizedName.toLowerCase();
  if (lowerName.includes("premium")) {
    return { creditsPerMonth: 200, maxRolloverCredits: 100 };
  }
  if (lowerName.includes("pro")) {
    return { creditsPerMonth: 100, maxRolloverCredits: 50 };
  }

  // Default to Free tier
  return { creditsPerMonth: 50, maxRolloverCredits: 0 };
}

async function migrateAllSubscriptions() {
  console.log("🔄 Starting production credit migration...\n");

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
        const { creditsPerMonth, maxRolloverCredits } = getCreditAllocation(sub.plan.name);

        // Check if credits are already set correctly
        if (
          sub.creditsPerMonth === creditsPerMonth &&
          sub.maxRolloverCredits === maxRolloverCredits &&
          sub.currentCredits > 0
        ) {
          console.log(
            `⏭️  Skipping user ${sub.userId} - credits already correct (${sub.creditsPerMonth} credits/month for ${sub.plan.name})`
          );
          skipped++;
          continue;
        }

        // Update subscription with correct credits
        await prisma.userSubscription.update({
          where: { id: sub.id },
          data: {
            creditsPerMonth,
            currentCredits: creditsPerMonth, // Give full credits on migration
            maxRolloverCredits,
            creditsUsedThisMonth: 0,
            totalCreditsUsed: 0,
            // Ensure period dates are set
            currentPeriodStart: sub.currentPeriodStart || new Date(),
            currentPeriodEnd: sub.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        console.log(
          `✅ Migrated user ${sub.userId}: ${creditsPerMonth} credits/month, ${maxRolloverCredits} max rollover (plan: ${sub.plan.name})`
        );
        migrated++;
      } catch (error: any) {
        console.error(`❌ Error migrating user ${sub.userId}:`, error.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary:");
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log("=".repeat(60));

    if (errors === 0) {
      console.log("\n🎉 Migration completed successfully!");
    } else {
      console.log(`\n⚠️  Migration completed with ${errors} error(s). Please review the logs above.`);
    }
  } catch (error: any) {
    console.error("❌ Fatal error during migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateAllSubscriptions();


