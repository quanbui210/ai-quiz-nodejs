/**
 * Script to sync all existing UserSubscription records from Stripe Product metadata
 * 
 * This updates all UserSubscription records to match the limits defined in Stripe Product metadata.
 * Run this after updating Stripe Product metadata to sync all existing subscriptions.
 * 
 * Usage:
 *   npx ts-node scripts/sync-subscriptions-from-stripe.ts
 */

import prisma from "../src/utils/prisma";
import { updateSubscriptionFromPlan } from "../src/utils/subscription";

async function syncAllSubscriptions() {
  console.log("Starting subscription sync from Stripe...\n");

  try {
    // Get all active subscriptions
    const subscriptions = await prisma.userSubscription.findMany({
      include: {
        plan: true,
      },
    });

    console.log(`Found ${subscriptions.length} subscriptions to sync\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const subscription of subscriptions) {
      try {
        console.log(`Syncing subscription for user ${subscription.userId} (Plan: ${subscription.plan.name})...`);
        
        await updateSubscriptionFromPlan(subscription.userId, subscription.planId);
        
        // Verify the update
        const updated = await prisma.userSubscription.findUnique({
          where: { userId: subscription.userId },
          include: { plan: true },
        });

        console.log(`  ✓ Updated limits:`);
        console.log(`    - Topics: ${updated?.maxTopics}`);
        console.log(`    - Quizzes: ${updated?.maxQuizzes}`);
        console.log(`    - Documents: ${updated?.maxDocuments}`);
        console.log(`    - Career Roadmaps: ${updated?.maxCareerRoadmaps}`);
        console.log(`    - Interview Sessions: ${updated?.maxInterviewSessionsPerMonth}`);
        console.log(`    - Resumes: ${updated?.maxResumes}`);
        console.log("");

        successCount++;
      } catch (error: any) {
        console.error(`  ✗ Error syncing subscription for user ${subscription.userId}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n=== Sync Complete ===");
    console.log(`Successfully synced: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total: ${subscriptions.length}`);

  } catch (error: any) {
    console.error("Fatal error during sync:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the sync
syncAllSubscriptions()
  .then(() => {
    console.log("\nSync completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Sync failed:", error);
    process.exit(1);
  });

