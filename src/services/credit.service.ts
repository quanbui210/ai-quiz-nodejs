import prisma from "../utils/prisma";
import { CreditTransactionType } from "@prisma/client";

export enum Feature {
  QUIZ_GENERATION = "quiz_generation",
  DOCUMENT_ANALYSIS = "document_analysis",
  JOB_MATCHING = "job_matching",
  SKILL_MASTERY_ROADMAP = "skill_mastery_roadmap",
  CAREER_ROADMAP = "career_roadmap",
  INTERVIEW_SESSION = "interview_session",
}

// Default credit costs (can be overridden by CreditPricing table)
export const DEFAULT_CREDIT_COSTS: Record<Feature, number> = {
  [Feature.QUIZ_GENERATION]: 2,
  [Feature.DOCUMENT_ANALYSIS]: 3,
  [Feature.JOB_MATCHING]: 5,
  [Feature.SKILL_MASTERY_ROADMAP]: 5,
  [Feature.CAREER_ROADMAP]: 8,
  [Feature.INTERVIEW_SESSION]: 5,
};

export class CreditService {

  static async getBalance(userId: string): Promise<number> {
    const subscription = await prisma.userSubscription.findUnique({
      where: { userId },
      select: { currentCredits: true },
    });

    return subscription?.currentCredits ?? 0;
  }


  static async getCreditCost(feature: Feature): Promise<number> {
    const pricing = await prisma.creditPricing.findUnique({
      where: { feature, isActive: true },
    });

    return pricing?.creditCost ?? DEFAULT_CREDIT_COSTS[feature];
  }


  static async hasEnoughCredits(
    userId: string,
    feature: Feature
  ): Promise<{ hasCredits: boolean; currentBalance: number; required: number }> {
    const [balance, cost] = await Promise.all([
      this.getBalance(userId),
      this.getCreditCost(feature),
    ]);

    return {
      hasCredits: balance >= cost,
      currentBalance: balance,
      required: cost,
    };
  }


  static async deductCredits(
    userId: string,
    feature: Feature,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
    const cost = await this.getCreditCost(feature);

    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.userSubscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error("User subscription not found");
      }

      if (subscription.currentCredits < cost) {
        throw new Error(
          `Insufficient credits. Required: ${cost}, Available: ${subscription.currentCredits}`
        );
      }

      const updated = await tx.userSubscription.update({
        where: { userId },
        data: {
          currentCredits: { decrement: cost },
          creditsUsedThisMonth: { increment: cost },
          totalCreditsUsed: { increment: cost },
        },
      });

      const transaction = await tx.creditTransaction.create({
        data: {
          userId,
          amount: -cost,
          balance: updated.currentCredits,
          type: CreditTransactionType.USAGE,
          description: `Used ${cost} credits for ${feature}`,
          metadata: {
            feature,
            ...metadata,
          },
        },
      });

      return {
        success: true,
        newBalance: updated.currentCredits,
        transactionId: transaction.id,
      };
    });

    return result;
  }


  static async refundCredits(
    userId: string,
    feature: Feature,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; newBalance: number }> {
    const cost = await this.getCreditCost(feature);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.userSubscription.update({
        where: { userId },
        data: {
          currentCredits: { increment: cost },
          creditsUsedThisMonth: { decrement: cost },
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          amount: cost,
          balance: updated.currentCredits,
          type: CreditTransactionType.REFUND,
          description: `Refunded ${cost} credits: ${reason}`,
          metadata: {
            feature,
            reason,
            ...metadata,
          },
        },
      });

      return {
        success: true,
        newBalance: updated.currentCredits,
      };
    });

    return result;
  }

  static async addCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    description: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; newBalance: number }> {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.userSubscription.update({
        where: { userId },
        data: {
          currentCredits: { increment: amount },
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          amount,
          balance: updated.currentCredits,
          type,
          description,
          metadata,
        },
      });

      return {
        success: true,
        newBalance: updated.currentCredits,
      };
    });

    return result;
  }

  static async refreshMonthlyCredits(userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const subscription = await tx.userSubscription.findUnique({
        where: { userId },
      });

      if (!subscription) return;

      const unusedCredits = subscription.currentCredits;
      const rolloverAmount = Math.min(
        unusedCredits,
        subscription.maxRolloverCredits
      );

      const newBalance =
        subscription.creditsPerMonth + rolloverAmount;

      const now = new Date();
      const creditPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

      await tx.userSubscription.update({
        where: { userId },
        data: {
          currentCredits: newBalance,
          creditsUsedThisMonth: 0,
          creditPeriodStart: now, 
          creditPeriodEnd: creditPeriodEnd, 
        },
      });

      // Log monthly allocation
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: subscription.creditsPerMonth,
          balance: newBalance,
          type: CreditTransactionType.MONTHLY_ALLOCATION,
          description: `Monthly credit allocation: ${subscription.creditsPerMonth} credits`,
          metadata: {
            rollover: rolloverAmount,
          },
        },
      });

      // Log rollover if any
      if (rolloverAmount > 0) {
        await tx.creditTransaction.create({
          data: {
            userId,
            amount: rolloverAmount,
            balance: newBalance,
            type: CreditTransactionType.ROLLOVER,
            description: `Rolled over ${rolloverAmount} unused credits`,
          },
        });
      }
    });
  }


  static async getTransactionHistory(
    userId: string,
    limit: number = 50
  ): Promise<any[]> {
    return prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }


  static async getUsageAnalytics(userId: string): Promise<{
    currentBalance: number;
    creditsUsedThisMonth: number;
    creditsPerMonth: number;
    utilizationRate: number;
    topFeatures: Array<{ feature: string; credits: number; count: number }>;
  }> {
    const subscription = await prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        userId,
        type: CreditTransactionType.USAGE,
        createdAt: {
          gte: subscription.currentPeriodStart || new Date(),
        },
      },
    });

    const featureUsage = transactions.reduce((acc, tx) => {
      const feature = (tx.metadata as any)?.feature || "unknown";
      if (!acc[feature]) {
        acc[feature] = { credits: 0, count: 0 };
      }
      acc[feature].credits += Math.abs(tx.amount);
      acc[feature].count += 1;
      return acc;
    }, {} as Record<string, { credits: number; count: number }>);

    const topFeatures = Object.entries(featureUsage)
      .map(([feature, data]) => ({ feature, ...data }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 5);

    return {
      currentBalance: subscription.currentCredits,
      creditsUsedThisMonth: subscription.creditsUsedThisMonth,
      creditsPerMonth: subscription.creditsPerMonth,
      utilizationRate:
        subscription.creditsPerMonth > 0
          ? (subscription.creditsUsedThisMonth /
              subscription.creditsPerMonth) *
            100
          : 0,
      topFeatures,
    };
  }
}

