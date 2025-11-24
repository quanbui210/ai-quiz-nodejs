import prisma from "./prisma";
import { SubscriptionStatus } from "@prisma/client";
import { stripe } from "./stripe";

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
      maxCareerRoadmaps: defaultPlan.maxCareerRoadmaps,
      maxInterviewSessionsPerMonth: defaultPlan.maxInterviewSessionsPerMonth,
      maxResumes: defaultPlan.maxResumes,
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

  // Try to get limits from Stripe Product metadata first (source of truth)
  let limitsFromStripe: {
    maxTopics?: number;
    maxQuizzes?: number;
    maxDocuments?: number;
    maxCareerRoadmaps?: number;
    maxInterviewSessionsPerMonth?: number;
    maxResumes?: number;
    allowedModels?: string[];
  } = {};

  try {
    // Try to get product from stripeProductId first
    if (plan.stripeProductId) {
      const product = await stripe.products.retrieve(plan.stripeProductId);
      if (product && !product.deleted && product.metadata) {
        if (product.metadata.maxTopics)
          limitsFromStripe.maxTopics = parseInt(product.metadata.maxTopics, 10);
        if (product.metadata.maxQuizzes)
          limitsFromStripe.maxQuizzes = parseInt(product.metadata.maxQuizzes, 10);
        if (product.metadata.maxDocuments)
          limitsFromStripe.maxDocuments = parseInt(product.metadata.maxDocuments, 10);
        if (product.metadata.maxCareerRoadmaps)
          limitsFromStripe.maxCareerRoadmaps = parseInt(product.metadata.maxCareerRoadmaps, 10);
        if (product.metadata.maxInterviewSessionsPerMonth)
          limitsFromStripe.maxInterviewSessionsPerMonth = parseInt(product.metadata.maxInterviewSessionsPerMonth, 10);
        if (product.metadata.maxResumes)
          limitsFromStripe.maxResumes = parseInt(product.metadata.maxResumes, 10);
        if (product.metadata.allowedModels) {
          try {
            const parsed = JSON.parse(product.metadata.allowedModels);
            limitsFromStripe.allowedModels = Array.isArray(parsed) ? parsed : plan.allowedModels;
          } catch {
            const models = product.metadata.allowedModels
              .split(",")
              .map((m: string) => m.trim());
            limitsFromStripe.allowedModels = models.length > 0 ? models : plan.allowedModels;
          }
        }
      }
    } else if (plan.stripePriceId) {
      // Fallback: get product from price
      const price = await stripe.prices.retrieve(plan.stripePriceId, {
        expand: ["product"],
      });
      const productData = price.product;
      if (productData && typeof productData !== "string" && !productData.deleted && productData.metadata) {
        if (productData.metadata.maxTopics)
          limitsFromStripe.maxTopics = parseInt(productData.metadata.maxTopics, 10);
        if (productData.metadata.maxQuizzes)
          limitsFromStripe.maxQuizzes = parseInt(productData.metadata.maxQuizzes, 10);
        if (productData.metadata.maxDocuments)
          limitsFromStripe.maxDocuments = parseInt(productData.metadata.maxDocuments, 10);
        if (productData.metadata.maxCareerRoadmaps)
          limitsFromStripe.maxCareerRoadmaps = parseInt(productData.metadata.maxCareerRoadmaps, 10);
        if (productData.metadata.maxInterviewSessionsPerMonth)
          limitsFromStripe.maxInterviewSessionsPerMonth = parseInt(productData.metadata.maxInterviewSessionsPerMonth, 10);
        if (productData.metadata.maxResumes)
          limitsFromStripe.maxResumes = parseInt(productData.metadata.maxResumes, 10);
        if (productData.metadata.allowedModels) {
          try {
            const parsed = JSON.parse(productData.metadata.allowedModels);
            limitsFromStripe.allowedModels = Array.isArray(parsed) ? parsed : plan.allowedModels;
          } catch {
            const models = productData.metadata.allowedModels
              .split(",")
              .map((m: string) => m.trim());
            limitsFromStripe.allowedModels = models.length > 0 ? models : plan.allowedModels;
          }
        }
      }
    }
  } catch (error: any) {
    console.warn(`Failed to fetch Stripe metadata for plan ${planId}, using database values:`, error.message);
  }

  // Use Stripe metadata if available, otherwise fallback to database values
  const subscription = await prisma.userSubscription.update({
    where: { userId },
    data: {
      planId: plan.id,
      maxTopics: limitsFromStripe.maxTopics ?? plan.maxTopics,
      maxQuizzes: limitsFromStripe.maxQuizzes ?? plan.maxQuizzes,
      maxDocuments: limitsFromStripe.maxDocuments ?? plan.maxDocuments,
      maxCareerRoadmaps: limitsFromStripe.maxCareerRoadmaps ?? plan.maxCareerRoadmaps,
      maxInterviewSessionsPerMonth: limitsFromStripe.maxInterviewSessionsPerMonth ?? plan.maxInterviewSessionsPerMonth,
      maxResumes: limitsFromStripe.maxResumes ?? plan.maxResumes,
      allowedModels: limitsFromStripe.allowedModels ?? plan.allowedModels,
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
    maxCareerRoadmaps?: number;
    maxInterviewSessionsPerMonth?: number;
    maxResumes?: number;
    allowedModels?: string[];
  },
) => {
  const updateData: any = {};
  if (limits.maxTopics !== undefined) updateData.maxTopics = limits.maxTopics;
  if (limits.maxQuizzes !== undefined)
    updateData.maxQuizzes = limits.maxQuizzes;
  if (limits.maxDocuments !== undefined)
    updateData.maxDocuments = limits.maxDocuments;
  if (limits.maxCareerRoadmaps !== undefined)
    updateData.maxCareerRoadmaps = limits.maxCareerRoadmaps;
  if (limits.maxInterviewSessionsPerMonth !== undefined)
    updateData.maxInterviewSessionsPerMonth = limits.maxInterviewSessionsPerMonth;
  if (limits.maxResumes !== undefined)
    updateData.maxResumes = limits.maxResumes;
  if (limits.allowedModels !== undefined)
    updateData.allowedModels = limits.allowedModels;

  return await prisma.userSubscription.update({
    where: { userId },
    data: updateData,
    include: { plan: true },
  });
};
