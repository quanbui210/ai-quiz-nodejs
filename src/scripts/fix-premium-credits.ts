import prisma from "../utils/prisma";



async function fixPremiumCredits() {
  console.log("🔧 Fixing Premium subscriptions...\n");

  try {
    const premiumSubscriptions = await prisma.userSubscription.findMany({
      where: {
        plan: {
          name: {
            in: ["Premium", "premium"],
          },
        },
      },
      include: {
        plan: true,
      },
    });

    console.log(`Found ${premiumSubscriptions.length} Premium subscriptions\n`);

    let updated = 0;
    let errors = 0;

    for (const sub of premiumSubscriptions) {
      try {
        await prisma.userSubscription.update({
          where: { id: sub.id },
          data: {
            creditsPerMonth: 200,
            maxRolloverCredits: 100,
            currentCredits: sub.currentCredits < 200 ? 200 : sub.currentCredits,
          },
        });

        console.log(`✅ Updated user ${sub.userId}: 200 credits/month (was ${sub.creditsPerMonth})`);
        updated++;
      } catch (error: any) {
        console.error(`❌ Error updating user ${sub.userId}:`, error.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 Fix Summary:");
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log("=".repeat(50));

    if (errors === 0) {
      console.log("\n🎉 All Premium subscriptions updated successfully!");
    }
  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run fix
fixPremiumCredits();


