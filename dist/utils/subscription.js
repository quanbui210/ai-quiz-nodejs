"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSubscriptionLimits =
  exports.updateSubscriptionFromPlan =
  exports.getOrCreateDefaultSubscription =
    void 0;
const prisma_1 = __importDefault(require("./prisma"));
const client_1 = require("@prisma/client");
const getOrCreateDefaultSubscription = async (userId) => {
  const existing = await prisma_1.default.userSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  if (existing) {
    return existing;
  }
  const defaultPlan = await prisma_1.default.subscriptionPlan.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (!defaultPlan) {
    throw new Error("No default subscription plan found");
  }
  const subscription = await prisma_1.default.userSubscription.create({
    data: {
      userId,
      planId: defaultPlan.id,
      maxTopics: defaultPlan.maxTopics,
      maxQuizzes: defaultPlan.maxQuizzes,
      maxDocuments: defaultPlan.maxDocuments,
      allowedModels: defaultPlan.allowedModels,
      status: client_1.SubscriptionStatus.ACTIVE,
    },
    include: { plan: true },
  });
  await prisma_1.default.userUsage.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return subscription;
};
exports.getOrCreateDefaultSubscription = getOrCreateDefaultSubscription;
const updateSubscriptionFromPlan = async (userId, planId) => {
  const plan = await prisma_1.default.subscriptionPlan.findUnique({
    where: { id: planId },
  });
  if (!plan) {
    throw new Error("Plan not found");
  }
  const subscription = await prisma_1.default.userSubscription.update({
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
exports.updateSubscriptionFromPlan = updateSubscriptionFromPlan;
const updateSubscriptionLimits = async (userId, limits) => {
  const updateData = {};
  if (limits.maxTopics !== undefined) updateData.maxTopics = limits.maxTopics;
  if (limits.maxQuizzes !== undefined)
    updateData.maxQuizzes = limits.maxQuizzes;
  if (limits.maxDocuments !== undefined)
    updateData.maxDocuments = limits.maxDocuments;
  if (limits.allowedModels !== undefined)
    updateData.allowedModels = limits.allowedModels;
  return await prisma_1.default.userSubscription.update({
    where: { userId },
    data: updateData,
    include: { plan: true },
  });
};
exports.updateSubscriptionLimits = updateSubscriptionLimits;
//# sourceMappingURL=subscription.js.map
