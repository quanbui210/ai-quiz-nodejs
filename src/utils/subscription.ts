import prisma from "./prisma";
import { SubscriptionStatus } from "@prisma/client";

export const getOrCreateDefaultSubscription = async (userId: string) => {
  const existing = await prisma.userSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  if (existing) {
    return existing;
  }

  const defaultPlan = await prisma.subscriptionPlan.findFirst({
    where: { isDefault: true, isActive: true },
  });

  if (!defaultPlan) {
    throw new Error("No default subscription plan found");
  }

  const subscription = await prisma.userSubscription.create({
    data: {
      userId,
      planId: defaultPlan.id,
      maxTopics: defaultPlan.maxTopics,
      maxQuizzes: defaultPlan.maxQuizzes,
      maxDocuments: defaultPlan.maxDocuments,
      allowedModels: defaultPlan.allowedModels,
      status: SubscriptionStatus.ACTIVE,
    },
    include: { plan: true },
  });

  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return subscription;
};

export const updateSubscriptionFromPlan = async (
  userId: string,
  planId: string,
) => {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error("Plan not found");
  }

  const subscription = await prisma.userSubscription.update({
    where: { userId },
    data: {
      planId: plan.id,
      maxTopics: plan.maxTopics,
      maxQuizzes: plan.maxQuizzes,
      maxDocuments: plan.maxDocuments,
      allowedModels: plan.allowedModels,
    },
    include: { plan: true },
  });

  return subscription;
};

export const updateSubscriptionLimits = async (
  userId: string,
  limits: {
    maxTopics?: number;
    maxQuizzes?: number;
    maxDocuments?: number;
    allowedModels?: string[];
  },
) => {
  const updateData: any = {};
  if (limits.maxTopics !== undefined) updateData.maxTopics = limits.maxTopics;
  if (limits.maxQuizzes !== undefined)
    updateData.maxQuizzes = limits.maxQuizzes;
  if (limits.maxDocuments !== undefined)
    updateData.maxDocuments = limits.maxDocuments;
  if (limits.allowedModels !== undefined)
    updateData.allowedModels = limits.allowedModels;

  return await prisma.userSubscription.update({
    where: { userId },
    data: updateData,
    include: { plan: true },
  });
};
