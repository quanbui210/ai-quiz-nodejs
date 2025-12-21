import prisma from "../utils/prisma";
import { CreditService } from "./credit.service";




export async function refreshAllMonthlyCredits(): Promise<void> {
  console.log("[Credit Cron] Starting monthly credit refresh...");
  const startTime = Date.now();

  try {
    const now = new Date();
    const subscriptions = await prisma.userSubscription.findMany({
      where: {
        status: "ACTIVE",
        creditPeriodEnd: {
          lte: now, 
        },
      },
      select: {
        userId: true,
        creditPeriodEnd: true,
        creditsPerMonth: true,
        currentCredits: true,
      },
    });

    console.log(`[Credit Cron] Found ${subscriptions.length} subscriptions to refresh`);

    let refreshed = 0;
    let errors = 0;

    for (const sub of subscriptions) {
      try {
        await CreditService.refreshMonthlyCredits(sub.userId);
        refreshed++;
        
        if (refreshed % 10 === 0) {
          console.log(`[Credit Cron] Refreshed ${refreshed}/${subscriptions.length} subscriptions...`);
        }
      } catch (error: any) {
        console.error(`[Credit Cron] Error refreshing credits for user ${sub.userId}:`, error.message);
        errors++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[Credit Cron]  Completed in ${duration}s:`);
    console.log(`  - Refreshed: ${refreshed}`);
    console.log(`  - Errors: ${errors}`);
  } catch (error: any) {
    console.error("[Credit Cron]  Fatal error:", error);
    throw error;
  }
}


export async function refreshUserCredits(userId: string): Promise<void> {
  try {
    await CreditService.refreshMonthlyCredits(userId);
    console.log(`[Credit Cron]  Refreshed credits for user ${userId}`);
  } catch (error: any) {
    console.error(`[Credit Cron] Error refreshing credits for user ${userId}:`, error.message);
    throw error;
  }
}

