import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/admin.middleware";
import { updateSubscriptionLimits } from "../../utils/subscription";
import { AdminRole } from "@prisma/client";
import { stripe } from "../../utils/stripe";


export const getDashboard = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const [
      totalUsers,
      totalSubscriptions,
      activeSubscriptions,
      canceledSubscriptions,
      totalTopics,
      totalQuizzes,
      totalDocuments,
      plans,
      subscriptionByPlan,
      totalUsage,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.userSubscription.count(),
      prisma.userSubscription.count({
        where: { status: "ACTIVE" },
      }),
      prisma.userSubscription.count({
        where: { status: "CANCELED" },
      }),
      prisma.topic.count(),
      prisma.quiz.count(),
      prisma.document.count(),
      prisma.subscriptionPlan.count(),
      prisma.userSubscription.groupBy({
        by: ["planId"],
        _count: true,
        where: { status: "ACTIVE" },
      }),
      prisma.userUsage.aggregate({
        _sum: {
          topicsCount: true,
          quizzesCount: true,
          documentsCount: true,
        },
      }),
    ]);

    const planIds = subscriptionByPlan.map((s) => s.planId);
    const plansData = await prisma.subscriptionPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, name: true },
    });

    const subscriptionBreakdown = subscriptionByPlan.map((sub) => {
      const plan = plansData.find((p) => p.id === sub.planId);
      return {
        planId: sub.planId,
        planName: plan?.name || "Unknown",
        count: sub._count,
      };
    });

    let revenue = {
      total: 0,
      monthly: 0,
      yearly: 0,
      currency: "usd",
    };

    try {
      const twelveMonthsAgo = Math.floor(
        (Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000,
      );
      const oneMonthAgo = Math.floor(
        (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000,
      );

      const [allInvoices, monthlyInvoices] = await Promise.all([
        stripe.invoices.list({
          status: "paid",
          created: { gte: twelveMonthsAgo },
          limit: 100,
        }),
        stripe.invoices.list({
          status: "paid",
          created: { gte: oneMonthAgo },
          limit: 100,
        }),
      ]);

      revenue.total =
        allInvoices.data.reduce(
          (sum, invoice) => sum + (invoice.amount_paid || 0),
          0,
        ) / 100;
      revenue.monthly =
        monthlyInvoices.data.reduce(
          (sum, invoice) => sum + (invoice.amount_paid || 0),
          0,
        ) / 100;
      revenue.yearly = revenue.total; // All subscriptions are yearly
      revenue.currency = allInvoices.data[0]?.currency?.toUpperCase() || "USD";
    } catch (stripeError: any) {
      console.error("Error fetching Stripe revenue:", stripeError.message);
    }

    const freeSubscriptions = await prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        plan: {
          isDefault: true,
        },
      },
    });

    const paidSubscriptions = activeSubscriptions - freeSubscriptions;

    const detailedSubscriptions = await prisma.userSubscription.findMany({
      where: {
        status: "ACTIVE",
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            stripePriceId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        currentPeriodStart: "desc",
      },
    });

    const subscriptions = detailedSubscriptions.map((sub) => ({
      id: sub.id,
      userId: sub.userId,
      user: {
        id: sub.user.id,
        email: sub.user.email,
        name: sub.user.name,
        joinedAt: sub.user.createdAt,
      },
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        stripePriceId: sub.plan.stripePriceId,
      },
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      limits: {
        maxTopics: sub.maxTopics,
        maxQuizzes: sub.maxQuizzes,
        maxDocuments: sub.maxDocuments,
        allowedModels: sub.allowedModels,
      },
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }));

    return res.json({
      stats: {
        totalUsers,
        activeSubscriptions,
        canceledSubscriptions,
        freeSubscriptions,
        paidSubscriptions,
        totalSubscriptions,
        
        totalTopics,
        totalQuizzes,
        totalDocuments,
        
        totalUsage: {
          topics: totalUsage._sum.topicsCount || 0,
          quizzes: totalUsage._sum.quizzesCount || 0,
          documents: totalUsage._sum.documentsCount || 0,
        },
        
        revenue,
        
        totalPlans: plans,
        subscriptionBreakdown,
        subscriptions, 
      },
    });
  } catch (error: any) {
    console.error("Get dashboard error:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};

export const listUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          subscription: {
            include: { plan: true },
          },
          usage: true,
          adminProfile: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("List users error:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const getUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: {
          include: { plan: true },
        },
        usage: true,
        adminProfile: true,
        topics: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
        quizzes: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user });
  } catch (error: any) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
};

export const updateUserLimits = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { maxTopics, maxQuizzes, maxDocuments, allowedModels } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get or create subscription
    let subscription = await prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      // Create default subscription first
      const { getOrCreateDefaultSubscription } = await import(
        "../../utils/subscription"
      );
      subscription = await getOrCreateDefaultSubscription(userId);
    }

    // Update limits
    const updated = await updateSubscriptionLimits(userId, {
      maxTopics,
      maxQuizzes,
      maxDocuments,
      allowedModels,
    });

    return res.json({
      message: "User limits updated successfully",
      subscription: updated,
    });
  } catch (error: any) {
    console.error("Update user limits error:", error);
    return res.status(500).json({ error: "Failed to update user limits" });
  }
};

/**
 * Change user's subscription plan
 */
export const changeUserSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { userId } = req.params;
    const { planId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Get or create subscription
    let subscription = await prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      const { getOrCreateDefaultSubscription } = await import(
        "../../utils/subscription"
      );
      subscription = await getOrCreateDefaultSubscription(userId);
    }

    // Update subscription
    const { updateSubscriptionFromPlan } = await import(
      "../../utils/subscription"
    );
    const updated = await updateSubscriptionFromPlan(userId, planId);

    return res.json({
      message: "User subscription updated successfully",
      subscription: updated,
    });
  } catch (error: any) {
    console.error("Change user subscription error:", error);
    return res.status(500).json({ error: "Failed to update subscription" });
  }
};

/**
 * Grant admin privileges
 */
export const makeAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!role) {
      return res.status(400).json({ error: "role is required" });
    }

    const validRoles: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "MODERATOR"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: "Invalid role",
        validRoles,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const adminUser = await prisma.adminUser.upsert({
      where: { userId },
      create: {
        userId,
        role,
        permissions: permissions || [],
      },
      update: {
        role,
        permissions: permissions || [],
      },
    });

    return res.json({
      message: "Admin privileges granted successfully",
      admin: adminUser,
    });
  } catch (error: any) {
    console.error("Make admin error:", error);
    return res.status(500).json({ error: "Failed to grant admin privileges" });
  }
};

/**
 * Revoke admin privileges
 */
export const revokeAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Prevent revoking own admin access
    if (userId === req.user?.id) {
      return res.status(400).json({
        error: "Cannot revoke your own admin privileges",
      });
    }

    const adminUser = await prisma.adminUser.findUnique({
      where: { userId },
    });

    if (!adminUser) {
      return res.status(404).json({ error: "User is not an admin" });
    }

    await prisma.adminUser.delete({
      where: { userId },
    });

    return res.json({ message: "Admin privileges revoked successfully" });
  } catch (error: any) {
    console.error("Revoke admin error:", error);
    return res.status(500).json({ error: "Failed to revoke admin privileges" });
  }
};

/**
 * List all subscription plans
 */
export const listPlans = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return res.json({ plans });
  } catch (error: any) {
    console.error("List plans error:", error);
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
};

/**
 * Create custom subscription plan
 */
export const createPlan = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const {
      name,
      stripePriceId,
      stripeProductId,
      maxTopics,
      maxQuizzes,
      maxDocuments,
      allowedModels,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        stripePriceId,
        stripeProductId,
        isCustom: true,
        maxTopics: maxTopics || 0,
        maxQuizzes: maxQuizzes || 0,
        maxDocuments: maxDocuments || 0,
        allowedModels: allowedModels || [],
      },
    });

    return res.status(201).json({
      message: "Plan created successfully",
      plan,
    });
  } catch (error: any) {
    console.error("Create plan error:", error);
    return res.status(500).json({ error: "Failed to create plan" });
  }
};

/**
 * Update subscription plan
 */
export const updatePlan = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { planId } = req.params;
    const {
      name,
      stripePriceId,
      stripeProductId,
      isActive,
      maxTopics,
      maxQuizzes,
      maxDocuments,
      allowedModels,
    } = req.body;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Prevent modifying default plan's isDefault flag
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (stripePriceId !== undefined) updateData.stripePriceId = stripePriceId;
    if (stripeProductId !== undefined)
      updateData.stripeProductId = stripeProductId;
    if (isActive !== undefined && plan.isCustom)
      updateData.isActive = isActive;
    if (maxTopics !== undefined) updateData.maxTopics = maxTopics;
    if (maxQuizzes !== undefined) updateData.maxQuizzes = maxQuizzes;
    if (maxDocuments !== undefined) updateData.maxDocuments = maxDocuments;
    if (allowedModels !== undefined) updateData.allowedModels = allowedModels;

    const updated = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: updateData,
    });

    return res.json({
      message: "Plan updated successfully",
      plan: updated,
    });
  } catch (error: any) {
    console.error("Update plan error:", error);
    return res.status(500).json({ error: "Failed to update plan" });
  }
};

/**
 * Delete custom subscription plan
 */
export const deletePlan = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { planId } = req.params;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        subscriptions: true,
      },
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Prevent deleting default plans
    if (plan.isDefault) {
      return res.status(400).json({
        error: "Cannot delete default plan",
      });
    }

    // Prevent deleting plans with active subscriptions
    if (plan.subscriptions.length > 0) {
      return res.status(400).json({
        error: "Cannot delete plan with active subscriptions",
        activeSubscriptions: plan.subscriptions.length,
      });
    }

    await prisma.subscriptionPlan.delete({
      where: { id: planId },
    });

    return res.json({ message: "Plan deleted successfully" });
  } catch (error: any) {
    console.error("Delete plan error:", error);
    return res.status(500).json({ error: "Failed to delete plan" });
  }
};

