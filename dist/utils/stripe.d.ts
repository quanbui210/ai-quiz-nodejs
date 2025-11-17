import Stripe from "stripe";
export declare const stripe: Stripe;
export declare const getWebhookSecret: () => string;
export declare const verifyWebhookSignature: (payload: string | Buffer, signature: string) => Stripe.Event | null;
//# sourceMappingURL=stripe.d.ts.map