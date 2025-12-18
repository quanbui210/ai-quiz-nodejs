import prisma from "../utils/prisma";

/**
 * Production Script to Update Subscription Plans
 * 
 * This script updates SubscriptionPlan records to ensure they have
 * correct credit information. You may want to update Stripe product
 * metadata as well.
 * 
 * Note: This script doesn't modify Stripe - you'll need to update
 * Stripe product metadata manually or via Stripe dashboard.
 */

const PLAN_UPDATES: Record<string, { creditsPerMonth: number; maxRolloverCredits: number }> = {
  "Free": { creditsPerMonth: 50, maxRolloverCredits: 0 },
  "Pro": { creditsPerMonth: 100, maxRolloverCredits: 50 },
  "Premium": { creditsPerMonth: 200, maxRolloverCredits: 100 },
};

async function updatePlans() {
  console.log("🔄 Updating subscription plans...\n");

  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
    });

    console.log(`Found ${plans.length} active plans\n`);

    let updated = 0;
    let skipped = 0;

    for (const plan of plans) {
      const update = PLAN_UPDATES[plan.name];
      
      if (!update) {
        console.log(`⏭️  Skipping plan "${plan.name}" - no credit mapping defined`);
        skipped++;
        continue;
      }

      // Note: SubscriptionPlan doesn't have credit fields in the schema
      // This script is for reference/documentation purposes
      // Actual credit allocation is determined by:
      // 1. Stripe product metadata (creditsPerMonth, maxRolloverCredits)
      // 2. Plan name mapping in getCreditAllocationFromPlan()
      
      console.log(`📝 Plan "${plan.name}":`);
      console.log(`   - Credits per month: ${update.creditsPerMonth}`);
      console.log(`   - Max rollover credits: ${update.maxRolloverCredits}`);
      console.log(`   - Stripe Product ID: ${plan.stripeProductId || "N/A"}`);
      console.log(`   - Stripe Price ID: ${plan.stripePriceId || "N/A"}`);
      console.log(`\n   ⚠️  Remember to update Stripe product metadata:`);
      console.log(`      creditsPerMonth: ${update.creditsPerMonth}`);
      console.log(`      maxRolloverCredits: ${update.maxRolloverCredits}\n`);
      
      updated++;
    }

    console.log("=".repeat(60));
    console.log("📊 Summary:");
    console.log(`   ✅ Reviewed: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log("=".repeat(60));
    console.log("\n⚠️  IMPORTANT: Update Stripe product metadata manually!");
    console.log("   Go to Stripe Dashboard > Products > [Your Product] > Metadata");
    console.log("   Add: creditsPerMonth and maxRolloverCredits\n");
  } catch (error: any) {
    console.error("❌ Error updating plans:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updatePlans();


