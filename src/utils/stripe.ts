import Stripe from "stripe";

const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_key";
const stripeWebhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder_secret";

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-10-29.clover",
});

export const getWebhookSecret = () => stripeWebhookSecret;

export const verifyWebhookSignature = (
  payload: string | Buffer,
  signature: string,
): Stripe.Event | null => {
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      stripeWebhookSecret,
    );
  } catch (error: any) {
    console.error("Webhook signature verification failed:", error.message);
    return null;
  }
};
