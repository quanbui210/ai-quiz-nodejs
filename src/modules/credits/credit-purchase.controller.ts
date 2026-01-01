import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import prisma from "../../utils/prisma";
import { stripe } from "../../utils/stripe";
import { CreditService } from "../../services/credit.service";
import { CreditTransactionType } from "@prisma/client";
import { getOrCreateDefaultSubscription } from "../../utils/subscription";

export const getCreditPacks = async (req: Request, res: Response) => {
  try {
    const packs = await (prisma as any).creditPack.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });

    const packsWithPricing = await Promise.all(
      packs.map(async (pack: any) => {
        let stripePrice = null;

        if (pack.stripePriceId) {
          try {
            const price = await stripe.prices.retrieve(pack.stripePriceId);
            stripePrice = {
              id: price.id,
              amount: price.unit_amount,
              currency: price.currency,
              formatted: formatPrice(price.unit_amount || 0, price.currency || "eur"),
            };
          } catch (error: any) {
            console.error(`Failed to fetch Stripe price for pack ${pack.id}:`, error.message);
          }
        }

        return {
          id: pack.id,
          credits: pack.credits,
          bonusCredits: pack.bonusCredits,
          totalCredits: pack.credits + pack.bonusCredits,
          price: pack.price,
          priceFormatted: formatPrice(pack.price, "eur"),
          pricePerCredit: (pack.price / (pack.credits + pack.bonusCredits)).toFixed(2),
          description: pack.description,
          stripePriceId: pack.stripePriceId,
          stripePrice,
        };
      }),
    );

    return res.json({ packs: packsWithPricing });
  } catch (error: any) {
    console.error("Get credit packs error:", error);
    return res.status(500).json({ error: "Failed to fetch credit packs" });
  }
};

export const createCreditPurchaseCheckout = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { packId } = req.body;

    if (!packId) {
      return res.status(400).json({ error: "packId is required" });
    }

    const pack = await (prisma as any).creditPack.findUnique({
      where: { id: packId },
    });

    if (!pack || !pack.isActive) {
      return res.status(404).json({ error: "Credit pack not found or inactive" });
    }

    if (!pack.stripePriceId) {
      return res.status(400).json({ error: "Credit pack not configured with Stripe price" });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let subscription = await prisma.userSubscription.findUnique({
      where: { userId: req.user.id },
    });

    let stripeCustomerId = subscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        metadata: {
          userId: req.user.id,
        },
      });

      stripeCustomerId = customer.id;

      if (subscription) {
        await prisma.userSubscription.update({
          where: { userId: req.user.id },
          data: { stripeCustomerId },
        });
      } else {
        subscription = await getOrCreateDefaultSubscription(req.user.id);
        await prisma.userSubscription.update({
          where: { userId: req.user.id },
          data: { stripeCustomerId },
        });
      }
    }

    console.log("Creating Stripe checkout session:", {
      packId: pack.id,
      credits: pack.credits,
      stripePriceId: pack.stripePriceId,
      customerId: stripeCustomerId,
    });

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: pack.stripePriceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/credits/cancel`,
      metadata: {
        userId: req.user.id,
        packId: pack.id,
        credits: pack.credits.toString(),
        bonusCredits: pack.bonusCredits.toString(),
        totalCredits: (pack.credits + pack.bonusCredits).toString(),
      },
    });

    console.log("Stripe checkout session created successfully:", {
      sessionId: session.id,
      url: session.url,
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("Create credit purchase checkout error:", {
      error: error.message,
      stack: error.stack,
      type: error.type,
      code: error.code,
      packId: req.body?.packId,
      userId: req.user?.id,
      stripeError: error.raw || error,
    });
    
    let errorMessage = "Failed to create checkout session";
    if (error.type === "StripeInvalidRequestError") {
      if (error.code === "resource_missing") {
        errorMessage = "Invalid Stripe price ID. Please check the price configuration.";
      } else if (error.message?.includes("recurring")) {
        errorMessage = "Price is configured as recurring. It must be a one-time payment.";
      } else {
        errorMessage = error.message || errorMessage;
      }
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const handleCreditPurchaseWebhook = async (
  req: Request,
  res: Response,
) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event;

  try {
    const { verifyWebhookSignature } = await import("../../utils/stripe");
    event = verifyWebhookSignature(req.body, sig);
  } catch (error: any) {
    console.error("Webhook signature verification failed:", error.message);
    return res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }

  if (!event) {
    console.error("Webhook: Invalid webhook event");
    return res.status(400).json({ error: "Invalid webhook event" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;

    if (session.mode === "payment" && session.metadata?.packId) {
      try {
        const userId = session.metadata.userId;
        const packId = session.metadata.packId;
        const totalCredits = parseInt(session.metadata.totalCredits || "0", 10);

        if (!userId || !packId || totalCredits <= 0) {
          console.error("Invalid webhook metadata:", session.metadata);
          return res.status(400).json({ error: "Invalid metadata" });
        }

        await CreditService.addCredits(
          userId,
          totalCredits,
          CreditTransactionType.PURCHASE,
          `Purchased ${totalCredits} credits (pack: ${packId})`,
          {
            packId,
            credits: parseInt(session.metadata.credits || "0", 10),
            bonusCredits: parseInt(session.metadata.bonusCredits || "0", 10),
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
          },
        );

        console.log(`Successfully added ${totalCredits} credits to user ${userId} from pack ${packId}`);

        return res.json({ received: true });
      } catch (error: any) {
        console.error("Error processing credit purchase webhook:", error);
        return res.status(500).json({ error: "Failed to process purchase" });
      }
    }
  }

  return res.json({ received: true });
};

function formatPrice(amount: number, currency: string = "eur"): string {
  const formatter = new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });

  return formatter.format(amount / 100);
}

