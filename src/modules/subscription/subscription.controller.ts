import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { stripe, verifyWebhookSignature } from "../../utils/stripe";
import {
  getOrCreateDefaultSubscription,
  updateSubscriptionFromPlan,
} from "../../utils/subscription";
import { getUserSubscription, getUserUsage } from "../../utils/usage";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import Stripe from "stripe";


export const getPlans = async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return res.json({ plans });
  } catch (error: any) {
    console.error("Get plans error:", error);
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
};


export const getMySubscription = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    let subscription = await getUserSubscription(req.user.id);

    if (!subscription) {
      subscription = await getOrCreateDefaultSubscription(req.user.id);
    }

    const usage = await getUserUsage(req.user.id);

    return res.json({
      subscription: {
        ...subscription,
        plan: subscription.plan,
      },
      usage: {
        topicsCount: usage.topicsCount,
        quizzesCount: usage.quizzesCount,
        documentsCount: usage.documentsCount,
        topicsRemaining: subscription.maxTopics - usage.topicsCount,
        quizzesRemaining: subscription.maxQuizzes - usage.quizzesCount,
        documentsRemaining: subscription.maxDocuments - usage.documentsCount,
      },
    });
  } catch (error: any) {
    console.error("Get subscription error:", error);
    return res.status(500).json({ error: "Failed to fetch subscription" });
  }
};


export const createCheckoutSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    if (!plan.stripePriceId) {
      return res.status(400).json({
        error: "Plan does not have a Stripe price ID",
        message: "This plan cannot be purchased via Stripe",
      });
    }

    let subscription = await getUserSubscription(req.user.id);
    let customerId = subscription?.stripeCustomerId;
    const hasActiveStripeSubscription = subscription?.stripeSubscriptionId;

    if (hasActiveStripeSubscription && subscription?.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId,
        );

        const subscriptionItemId = (stripeSubscription as any).items?.data?.[0]?.id;

        if (!subscriptionItemId) {
          return res.status(400).json({
            error: "Unable to update subscription",
            message: "Subscription item not found",
          });
        }

        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: plan.stripePriceId,
            },
          ],
          metadata: {
            userId: req.user.id,
            planId: plan.id,
          },
          proration_behavior: "always_invoice",
        });

        await updateSubscriptionFromPlan(req.user.id, planId);

        return res.json({
          message: "Subscription updated successfully",
          updated: true,
          planId: plan.id,
          planName: plan.name,
        });
      } catch (error: any) {
        console.error("Error updating subscription:", error);
        return res.status(500).json({
          error: "Failed to update subscription",
          message: error.message,
        });
      }
    }

    if (!customerId) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        metadata: {
          userId: req.user.id,
        },
      });

      customerId = customer.id;

      if (subscription) {
        await prisma.userSubscription.update({
          where: { userId: req.user.id },
          data: { stripeCustomerId: customerId },
        });
      } else {
        subscription = await getOrCreateDefaultSubscription(req.user.id);
        await prisma.userSubscription.update({
          where: { userId: req.user.id },
          data: { stripeCustomerId: customerId },
        });
      }
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: "subscription", 
      success_url: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/subscription/cancel`,
      metadata: {
        userId: req.user.id,
        planId: plan.id,
      },
      subscription_data: {
        metadata: {
          userId: req.user.id,
          planId: plan.id,
        },
      },
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("Create checkout session error:", error);
    return res.status(500).json({
      error: "Failed to create checkout session",
      message: error.message,
    });
  }
};


export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event | null = null;

  try {
    event = verifyWebhookSignature(req.body, sig);
  
  } catch (error: any) {
    console.error("Webhook signature verification failed:", error.message);
    return res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }

  if (!event) {
    console.error("Webhook: Invalid webhook event");
    return res.status(400).json({ error: "Invalid webhook event" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Processing checkout.session.completed:", {
          sessionId: session.id,
          userId: session.metadata?.userId,
          planId: session.metadata?.planId,
          subscriptionId: session.subscription,
        });
        await handleCheckoutCompleted(session);
        console.log("Successfully processed checkout.session.completed");
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
};


async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  console.log("handleCheckoutCompleted called with:", {
    userId,
    planId,
    subscriptionId: session.subscription,
    customerId: session.customer,
  });

  if (!userId || !planId) {
    console.error("Missing userId or planId in checkout session metadata:", {
      metadata: session.metadata,
    });
    return;
  }

  if (!session.subscription) {
    console.error("Missing subscription ID in checkout session");
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string,
  );


  const periodStart = (subscription as any).current_period_start;
  const periodEnd = (subscription as any).current_period_end;

  const currentPeriodStart = periodStart && typeof periodStart === "number"
    ? new Date(periodStart * 1000)
    : new Date();
  const currentPeriodEnd = periodEnd && typeof periodEnd === "number"
    ? new Date(periodEnd * 1000)
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year from now

  if (isNaN(currentPeriodStart.getTime()) || isNaN(currentPeriodEnd.getTime())) {
    console.error("Invalid period dates from Stripe subscription:", {
      current_period_start: (subscription as any).current_period_start,
      current_period_end: (subscription as any).current_period_end,
    });
    throw new Error("Invalid subscription period dates");
  }

  const updatedSubscription = await prisma.userSubscription.upsert({
    where: { userId },
    create: {
      userId,
      planId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      maxTopics: 0,
      maxQuizzes: 0,
      maxDocuments: 0,
      allowedModels: [],
      status: "ACTIVE",
      currentPeriodStart,
      currentPeriodEnd,
    },
    update: {
      planId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      status: "ACTIVE",
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  console.log("UserSubscription upserted:", {
    userId,
    planId,
    subscriptionId: updatedSubscription.id,
  });

  await updateSubscriptionFromPlan(userId, planId);
  
  const finalSubscription = await prisma.userSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  console.log("Final subscription after updateSubscriptionFromPlan:", {
    userId,
    planId: finalSubscription?.planId,
    planName: finalSubscription?.plan?.name,
    maxTopics: finalSubscription?.maxTopics,
    maxQuizzes: finalSubscription?.maxQuizzes,
  });
}



async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error(`Subscription not found: ${subscription.id}`);
    return;
  }


  const subscriptionItems = (subscription as any).items?.data || [];
  const currentPriceId = subscriptionItems[0]?.price?.id;

  let newPlanId = userSubscription.planId;

  if (currentPriceId) {
    const planWithPrice = await prisma.subscriptionPlan.findUnique({
      where: { stripePriceId: currentPriceId },
    });

    if (planWithPrice && planWithPrice.id !== userSubscription.planId) {
      console.log(
        `Plan change detected for subscription ${subscription.id}: ${userSubscription.planId} -> ${planWithPrice.id}`,
      );
      newPlanId = planWithPrice.id;
    }
  }

  const periodStart = (subscription as any).current_period_start;
  const periodEnd = (subscription as any).current_period_end;

  const currentPeriodStart = periodStart && typeof periodStart === "number"
    ? new Date(periodStart * 1000)
    : userSubscription.currentPeriodStart || new Date();
  const currentPeriodEnd = periodEnd && typeof periodEnd === "number"
    ? new Date(periodEnd * 1000)
    : userSubscription.currentPeriodEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const updateData: any = {
    status: mapStripeStatus(subscription.status),
    cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
  };

  if (!isNaN(currentPeriodStart.getTime())) {
    updateData.currentPeriodStart = currentPeriodStart;
  }
  if (!isNaN(currentPeriodEnd.getTime())) {
    updateData.currentPeriodEnd = currentPeriodEnd;
  }

  if (newPlanId !== userSubscription.planId) {
    updateData.planId = newPlanId;
    await updateSubscriptionFromPlan(userSubscription.userId, newPlanId);
  }

  await prisma.userSubscription.update({
    where: { id: userSubscription.id },
    data: updateData,
  });
}


async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    return;
  }

  const defaultPlan = await prisma.subscriptionPlan.findFirst({
    where: { isDefault: true },
  });

  if (defaultPlan) {
    await updateSubscriptionFromPlan(userSubscription.userId, defaultPlan.id);
    await prisma.userSubscription.update({
      where: { id: userSubscription.id },
      data: {
        status: "CANCELED",
        stripeSubscriptionId: null,
      },
    });
  } else {
    await prisma.userSubscription.update({
      where: { id: userSubscription.id },
      data: {
        status: "CANCELED",
        stripeSubscriptionId: null,
      },
    });
  }
}


async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string | null;
  if (!subscriptionId || typeof subscriptionId !== "string") return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionUpdated(subscription);
}


async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string | null;
  if (!subscriptionId || typeof subscriptionId !== "string") return;

  const userSubscription = await prisma.userSubscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (userSubscription) {
    await prisma.userSubscription.update({
      where: { id: userSubscription.id },
      data: { status: "PAST_DUE" },
    });
  }
}


function mapStripeStatus(
  status: Stripe.Subscription.Status,
): "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID" | "TRIALING" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "canceled":
      return "CANCELED";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "trialing":
      return "TRIALING";
    default:
      return "ACTIVE";
  }
}


export const cancelSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const subscription = await getUserSubscription(req.user.id);

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.userSubscription.update({
      where: { userId: req.user.id },
      data: { cancelAtPeriodEnd: true },
    });

    return res.json({
      message: "Subscription will be canceled at the end of the billing period",
    });
  } catch (error: any) {
    console.error("Cancel subscription error:", error);
    return res.status(500).json({ error: "Failed to cancel subscription" });
  }
};


export const resumeSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const subscription = await getUserSubscription(req.user.id);

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: "No subscription found" });
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await prisma.userSubscription.update({
      where: { userId: req.user.id },
      data: { cancelAtPeriodEnd: false },
    });

    return res.json({ message: "Subscription resumed successfully" });
  } catch (error: any) {
    console.error("Resume subscription error:", error);
    return res.status(500).json({ error: "Failed to resume subscription" });
  }
};


export const getCustomerPortal = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const subscription = await getUserSubscription(req.user.id);

    if (!subscription || !subscription.stripeCustomerId) {
      return res.status(404).json({
        error: "No Stripe customer found",
        message: "Please subscribe to a plan first",
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${frontendUrl}/subscription`,
    });

    return res.json({ url: session.url });
  } catch (error: any) {
    console.error("Get customer portal error:", error);
    return res.status(500).json({ error: "Failed to create portal session" });
  }
};

