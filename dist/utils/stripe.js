"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature =
  exports.getWebhookSecret =
  exports.stripe =
    void 0;
const stripe_1 = __importDefault(require("stripe"));
const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_key";
const stripeWebhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder_secret";
exports.stripe = new stripe_1.default(stripeSecretKey, {
  apiVersion: "2025-10-29.clover",
});
const getWebhookSecret = () => stripeWebhookSecret;
exports.getWebhookSecret = getWebhookSecret;
const verifyWebhookSignature = (payload, signature) => {
  try {
    return exports.stripe.webhooks.constructEvent(
      payload,
      signature,
      stripeWebhookSecret,
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);
    return null;
  }
};
exports.verifyWebhookSignature = verifyWebhookSignature;
//# sourceMappingURL=stripe.js.map
