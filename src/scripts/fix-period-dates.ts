import prisma from "../utils/prisma";

/**
 * Fix Period Dates Script
 * 
 * This script fixes users whose currentPeriodEnd is set incorrectly (e.g., 1 year instead of 30 days).
 * It updates all active subscriptions to have a proper 30-day period from their currentPeriodStart.
 */

async function fixPeriodDates() {
  console.log("🔧 Fixing incorrect period dates...\n");

  try {
    const now = new Date();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const oneYearInMs = 365 * 24 * 60 * 60 * 1000;

    // Find subscriptions with period end more than 60 days away (likely incorrect)
    const subscriptions = await prisma.userSubscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: {
          gt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // More than 60 days away
        },
      },
      select: {
        id: true,
        userId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    console.log(`Found ${subscriptions.length} subscriptions with suspicious period dates\n`);

    let fixed = 0;
    let skipped = 0;

    for (const sub of subscriptions) {
      try {
        // Calculate correct period end (30 days from period start, or 30 days from now if start is missing)
        const periodStart = sub.currentPeriodStart || new Date();
        const correctPeriodEnd = new Date(periodStart.getTime() + thirtyDaysInMs);

        // Only fix if the current period end is way off (more than 60 days)
        const daysDifference = (sub.currentPeriodEnd!.getTime() - correctPeriodEnd.getTime()) / (24 * 60 * 60 * 1000);
        
        if (Math.abs(daysDifference) > 5) {
          // Update to correct period end
          await prisma.userSubscription.update({
            where: { id: sub.id },
            data: {
              currentPeriodEnd: correctPeriodEnd,
              // Also ensure period start is set
              currentPeriodStart: periodStart,
            },
          });

          console.log(
            `✅ Fixed user ${sub.userId}: ${sub.currentPeriodEnd?.toISOString()} → ${correctPeriodEnd.toISOString()} (${Math.round(daysDifference)} days off)`
          );
          fixed++;
        } else {
          console.log(`⏭️  Skipping user ${sub.userId}: Period end is close enough (${Math.round(daysDifference)} days difference)`);
          skipped++;
        }
      } catch (error: any) {
        console.error(`❌ Error fixing user ${sub.userId}:`, error.message);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Fix Summary:");
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log("=".repeat(60));

    if (fixed > 0) {
      console.log("\n🎉 Period dates fixed! Users should now see correct reset dates.");
    } else {
      console.log("\n✅ No fixes needed. All period dates look correct.");
    }
  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run fix
fixPeriodDates();

