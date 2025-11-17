"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerPortal = exports.resumeSubscription = exports.cancelSubscription = exports.handleWebhook = exports.createCheckoutSession = exports.getMySubscription = exports.getPlans = void 0;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const stripe_1 = require("../../utils/stripe");
const subscription_1 = require("../../utils/subscription");
const usage_1 = require("../../utils/usage");
const getPlans = async (req, res) => {
    try {
        const plans = await prisma_1.default.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });
        const plansWithPricing = await Promise.all(plans.map(async (plan) => {
            let price = null;
            let product = null;
            if (plan.stripePriceId) {
                try {
                    const stripePrice = await stripe_1.stripe.prices.retrieve(plan.stripePriceId, {
                        expand: ['product'],
                    });
                    price = {
                        id: stripePrice.id,
                        amount: stripePrice.unit_amount,
                        currency: stripePrice.currency,
                        interval: stripePrice.recurring?.interval,
                        intervalCount: stripePrice.recurring?.interval_count || 1,
                        formatted: formatStripePrice(stripePrice),
                    };
                    const productData = stripePrice.product;
                    if (productData) {
                        if (typeof productData === 'string') {
                            try {
                                const fullProduct = await stripe_1.stripe.products.retrieve(productData);
                                product = {
                                    id: fullProduct.id,
                                    name: fullProduct.name,
                                    metadata: fullProduct.metadata || {},
                                };
                            }
                            catch (error) {
                                console.error(`Failed to fetch product ${productData}:`, error.message);
                            }
                        }
                        else if (productData.deleted !== true) {
                            product = {
                                id: productData.id,
                                name: productData.name || undefined,
                                metadata: productData.metadata || {},
                            };
                        }
                    }
                }
                catch (error) {
                    console.error(`Failed to fetch Stripe price for plan ${plan.id}:`, error.message);
                }
            }
            return {
                ...plan,
                price,
                limits: {
                    maxTopics: product?.metadata?.maxTopics
                        ? parseInt(product.metadata.maxTopics, 10)
                        : plan.maxTopics,
                    maxQuizzes: product?.metadata?.maxQuizzes
                        ? parseInt(product.metadata.maxQuizzes, 10)
                        : plan.maxQuizzes,
                    maxDocuments: product?.metadata?.maxDocuments
                        ? parseInt(product.metadata.maxDocuments, 10)
                        : plan.maxDocuments,
                    allowedModels: (() => {
                        if (product?.metadata?.allowedModels) {
                            try {
                                const parsed = JSON.parse(product.metadata.allowedModels);
                                return Array.isArray(parsed) ? parsed : plan.allowedModels;
                            }
                            catch {
                                const models = product.metadata.allowedModels.split(',').map((m) => m.trim());
                                return models.length > 0 ? models : plan.allowedModels;
                            }
                        }
                        return plan.allowedModels;
                    })(),
                },
            };
        }));
        return res.json({ plans: plansWithPricing });
    }
    catch (error) {
        console.error("Get plans error:", error);
        return res.status(500).json({ error: "Failed to fetch plans" });
    }
};
exports.getPlans = getPlans;
function formatStripePrice(price) {
    const amount = (price.unit_amount || 0) / 100;
    const currency = price.currency.toUpperCase();
    const interval = price.recurring?.interval || 'one_time';
    const intervalCount = price.recurring?.interval_count || 1;
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: price.currency,
    }).format(amount);
    if (interval === 'one_time') {
        return formattedAmount;
    }
    const intervalText = intervalCount === 1
        ? interval
        : `${intervalCount} ${interval}s`;
    return `${formattedAmount} per ${intervalText}`;
}
const getMySubscription = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "User not authenticated" });
        }
        let subscription = await (0, usage_1.getUserSubscription)(req.user.id);
        if (!subscription) {
            subscription = await (0, subscription_1.getOrCreateDefaultSubscription)(req.user.id);
        }
        const usage = await (0, usage_1.getUserUsage)(req.user.id);
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
    }
    catch (error) {
        console.error("Get subscription error:", error);
        return res.status(500).json({ error: "Failed to fetch subscription" });
    }
};
exports.getMySubscription = getMySubscription;
const createCheckoutSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "User not authenticated" });
        }
        const { planId } = req.body;
        if (!planId) {
            return res.status(400).json({ error: "planId is required" });
        }
        const plan = await prisma_1.default.subscriptionPlan.findUnique({
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
        let subscription = await (0, usage_1.getUserSubscription)(req.user.id);
        let customerId = subscription?.stripeCustomerId;
        const hasActiveStripeSubscription = subscription?.stripeSubscriptionId;
        if (hasActiveStripeSubscription && subscription?.stripeSubscriptionId && subscription?.stripeCustomerId) {
            const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
            try {
                const portalSession = await stripe_1.stripe.billingPortal.sessions.create({
                    customer: subscription.stripeCustomerId,
                    return_url: `${frontendUrl}/subscription`,
                });
                return res.json({
                    message: "Please use the Customer Portal to manage your subscription",
                    portalUrl: portalSession.url,
                    usePortal: true,
                });
            }
            catch (error) {
                console.error("Error creating portal session:", error);
                return res.status(500).json({
                    error: "Failed to create portal session",
                    message: error.message,
                });
            }
        }
        if (!customerId) {
            const user = await prisma_1.default.user.findUnique({
                where: { id: req.user.id },
            });
            const customer = await stripe_1.stripe.customers.create({
                email: user?.email || undefined,
                metadata: {
                    userId: req.user.id,
                },
            });
            customerId = customer.id;
            if (subscription) {
                await prisma_1.default.userSubscription.update({
                    where: { userId: req.user.id },
                    data: { stripeCustomerId: customerId },
                });
            }
            else {
                subscription = await (0, subscription_1.getOrCreateDefaultSubscription)(req.user.id);
                await prisma_1.default.userSubscription.update({
                    where: { userId: req.user.id },
                    data: { stripeCustomerId: customerId },
                });
            }
        }
        const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const session = await stripe_1.stripe.checkout.sessions.create({
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
    }
    catch (error) {
        console.error("Create checkout session error:", error);
        return res.status(500).json({
            error: "Failed to create checkout session",
            message: error.message,
        });
    }
};
exports.createCheckoutSession = createCheckoutSession;
const handleWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
        return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    let event = null;
    try {
        event = (0, stripe_1.verifyWebhookSignature)(req.body, sig);
    }
    catch (error) {
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
                const session = event.data.object;
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
                const subscription = event.data.object;
                console.log("Received customer.subscription.updated webhook:", {
                    subscriptionId: subscription.id,
                    status: subscription.status,
                    cancel_at_period_end: subscription.cancel_at_period_end,
                });
                await handleSubscriptionUpdated(subscription);
                console.log("Completed processing customer.subscription.updated");
                break;
            }
            case "customer.subscription.deleted": {
                const subscription = event.data.object;
                await handleSubscriptionDeleted(subscription);
                break;
            }
            case "invoice.payment_succeeded": {
                const invoice = event.data.object;
                await handlePaymentSucceeded(invoice);
                break;
            }
            case "invoice.payment_failed": {
                const invoice = event.data.object;
                await handlePaymentFailed(invoice);
                break;
            }
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        return res.json({ received: true });
    }
    catch (error) {
        console.error("Webhook handler error:", error);
        return res.status(500).json({ error: "Webhook handler failed" });
    }
};
exports.handleWebhook = handleWebhook;
async function handleCheckoutCompleted(session) {
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
    const subscription = await stripe_1.stripe.subscriptions.retrieve(session.subscription);
    const periodStart = subscription.current_period_start;
    const periodEnd = subscription.current_period_end;
    const currentPeriodStart = periodStart && typeof periodStart === "number"
        ? new Date(periodStart * 1000)
        : new Date();
    const currentPeriodEnd = periodEnd && typeof periodEnd === "number"
        ? new Date(periodEnd * 1000)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    if (isNaN(currentPeriodStart.getTime()) || isNaN(currentPeriodEnd.getTime())) {
        console.error("Invalid period dates from Stripe subscription:", {
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
        });
        throw new Error("Invalid subscription period dates");
    }
    const updatedSubscription = await prisma_1.default.userSubscription.upsert({
        where: { userId },
        create: {
            userId,
            planId,
            stripeCustomerId: session.customer,
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
            stripeCustomerId: session.customer,
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
    await (0, subscription_1.updateSubscriptionFromPlan)(userId, planId);
    const finalSubscription = await prisma_1.default.userSubscription.findUnique({
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
async function handleSubscriptionUpdated(subscription) {
    console.log("handleSubscriptionUpdated called with subscription (from webhook):", {
        id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
    });
    let latestSubscription;
    try {
        latestSubscription = await stripe_1.stripe.subscriptions.retrieve(subscription.id, {
            expand: ['items.data.price.product'],
        });
        const cancelAt = latestSubscription.cancel_at;
        const cancelAtPeriodEnd = latestSubscription.cancel_at_period_end;
        console.log("Retrieved latest subscription from Stripe:", {
            id: latestSubscription.id,
            status: latestSubscription.status,
            cancel_at_period_end: cancelAtPeriodEnd,
            cancel_at: cancelAt,
            cancel_at_timestamp: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
        });
    }
    catch (error) {
        console.error("Failed to retrieve subscription from Stripe:", error.message);
        latestSubscription = subscription;
    }
    const userSubscription = await prisma_1.default.userSubscription.findUnique({
        where: { stripeSubscriptionId: subscription.id },
    });
    if (!userSubscription) {
        console.error(`Subscription not found: ${subscription.id}`);
        return;
    }
    const subscriptionItems = latestSubscription.items?.data || [];
    const currentPriceId = subscriptionItems[0]?.price?.id;
    let newPlanId = userSubscription.planId;
    if (currentPriceId) {
        const planWithPrice = await prisma_1.default.subscriptionPlan.findUnique({
            where: { stripePriceId: currentPriceId },
        });
        if (planWithPrice && planWithPrice.id !== userSubscription.planId) {
            console.log(`Plan change detected for subscription ${subscription.id}: ${userSubscription.planId} -> ${planWithPrice.id}`);
            newPlanId = planWithPrice.id;
        }
    }
    const periodStart = latestSubscription.current_period_start;
    const periodEnd = latestSubscription.current_period_end;
    const currentPeriodStart = periodStart && typeof periodStart === "number"
        ? new Date(periodStart * 1000)
        : userSubscription.currentPeriodStart || new Date();
    const currentPeriodEnd = periodEnd && typeof periodEnd === "number"
        ? new Date(periodEnd * 1000)
        : userSubscription.currentPeriodEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const cancelAt = latestSubscription.cancel_at;
    const cancelAtPeriodEndFlag = latestSubscription.cancel_at_period_end;
    let cancelAtPeriodEnd;
    if (cancelAt) {
        const cancelAtDate = new Date(cancelAt * 1000);
        const now = new Date();
        cancelAtPeriodEnd = cancelAtDate > now;
    }
    else if (cancelAtPeriodEndFlag !== undefined && cancelAtPeriodEndFlag !== null) {
        cancelAtPeriodEnd = Boolean(cancelAtPeriodEndFlag);
    }
    else {
        cancelAtPeriodEnd = false;
    }
    console.log("Updating subscription with:", {
        userId: userSubscription.userId,
        subscriptionId: latestSubscription.id,
        cancelAtPeriodEnd,
        previousCancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd,
        status: mapStripeStatus(latestSubscription.status),
        cancel_at_from_webhook: subscription.cancel_at_period_end,
        cancel_at_from_stripe_api: latestSubscription.cancel_at_period_end,
        cancel_at_timestamp: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
        cancel_at_flag: cancelAtPeriodEndFlag,
        using_cancel_at_timestamp: cancelAtPeriodEndFlag === undefined && Boolean(cancelAt),
    });
    const updateData = {
        status: mapStripeStatus(latestSubscription.status),
        cancelAtPeriodEnd,
    };
    if (!isNaN(currentPeriodStart.getTime())) {
        updateData.currentPeriodStart = currentPeriodStart;
    }
    if (!isNaN(currentPeriodEnd.getTime())) {
        updateData.currentPeriodEnd = currentPeriodEnd;
    }
    if (newPlanId !== userSubscription.planId) {
        updateData.planId = newPlanId;
        await (0, subscription_1.updateSubscriptionFromPlan)(userSubscription.userId, newPlanId);
    }
    const updated = await prisma_1.default.userSubscription.update({
        where: { id: userSubscription.id },
        data: updateData,
    });
    console.log("Subscription updated successfully:", {
        userId: updated.userId,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        status: updated.status,
    });
}
async function handleSubscriptionDeleted(subscription) {
    const userSubscription = await prisma_1.default.userSubscription.findUnique({
        where: { stripeSubscriptionId: subscription.id },
    });
    if (!userSubscription) {
        return;
    }
    const defaultPlan = await prisma_1.default.subscriptionPlan.findFirst({
        where: { isDefault: true },
    });
    if (defaultPlan) {
        await (0, subscription_1.updateSubscriptionFromPlan)(userSubscription.userId, defaultPlan.id);
        await prisma_1.default.userSubscription.update({
            where: { id: userSubscription.id },
            data: {
                status: "CANCELED",
                stripeSubscriptionId: null,
            },
        });
    }
    else {
        await prisma_1.default.userSubscription.update({
            where: { id: userSubscription.id },
            data: {
                status: "CANCELED",
                stripeSubscriptionId: null,
            },
        });
    }
}
async function handlePaymentSucceeded(invoice) {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId || typeof subscriptionId !== "string")
        return;
    const subscription = await stripe_1.stripe.subscriptions.retrieve(subscriptionId);
    await handleSubscriptionUpdated(subscription);
}
async function handlePaymentFailed(invoice) {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId || typeof subscriptionId !== "string")
        return;
    const userSubscription = await prisma_1.default.userSubscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
    });
    if (userSubscription) {
        await prisma_1.default.userSubscription.update({
            where: { id: userSubscription.id },
            data: { status: "PAST_DUE" },
        });
    }
}
function mapStripeStatus(status) {
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
const cancelSubscription = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "User not authenticated" });
        }
        const subscription = await (0, usage_1.getUserSubscription)(req.user.id);
        if (!subscription || !subscription.stripeSubscriptionId) {
            return res.status(404).json({ error: "No active subscription found" });
        }
        await stripe_1.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        await prisma_1.default.userSubscription.update({
            where: { userId: req.user.id },
            data: { cancelAtPeriodEnd: true },
        });
        return res.json({
            message: "Subscription will be canceled at the end of the billing period",
        });
    }
    catch (error) {
        console.error("Cancel subscription error:", error);
        return res.status(500).json({ error: "Failed to cancel subscription" });
    }
};
exports.cancelSubscription = cancelSubscription;
const resumeSubscription = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "User not authenticated" });
        }
        const subscription = await (0, usage_1.getUserSubscription)(req.user.id);
        if (!subscription || !subscription.stripeSubscriptionId) {
            return res.status(404).json({ error: "No subscription found" });
        }
        await stripe_1.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: false,
        });
        await prisma_1.default.userSubscription.update({
            where: { userId: req.user.id },
            data: { cancelAtPeriodEnd: false },
        });
        return res.json({ message: "Subscription resumed successfully" });
    }
    catch (error) {
        console.error("Resume subscription error:", error);
        return res.status(500).json({ error: "Failed to resume subscription" });
    }
};
exports.resumeSubscription = resumeSubscription;
const getCustomerPortal = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "User not authenticated" });
        }
        const subscription = await (0, usage_1.getUserSubscription)(req.user.id);
        if (!subscription || !subscription.stripeCustomerId) {
            return res.status(404).json({
                error: "No Stripe customer found",
                message: "Please subscribe to a plan first",
            });
        }
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const session = await stripe_1.stripe.billingPortal.sessions.create({
            customer: subscription.stripeCustomerId,
            return_url: `${frontendUrl}/subscription`,
        });
        return res.json({
            url: session.url,
            message: "Redirect user to this URL to manage their subscription",
        });
    }
    catch (error) {
        console.error("Get customer portal error:", error);
        return res.status(500).json({ error: "Failed to create portal session" });
    }
};
exports.getCustomerPortal = getCustomerPortal;
//# sourceMappingURL=subscription.controller.js.map