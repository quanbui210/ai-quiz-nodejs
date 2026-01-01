import { Router, Request, Response } from "express";
import { CreditService } from "../../services/credit.service";
import { authenticate } from "../../middleware/auth.middleware";
import {
  getCreditPacks,
  createCreditPurchaseCheckout,
  handleCreditPurchaseWebhook,
} from "./credit-purchase.controller";
import { verifyWebhookSignature } from "../../utils/stripe";

const router = Router();


router.get("/balance", async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = req.user.id;
    const balance = await CreditService.getBalance(userId);

    return res.json({
      balance,
      userId,
    });
  } catch (error: any) {
    console.error("[Credits] Error getting balance:", error);
    return res.status(500).json({ error: "Failed to get credit balance" });
  }
});


router.get("/history", async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const transactions = await CreditService.getTransactionHistory(
      userId,
      limit
    );

    return res.json({
      transactions,
      count: transactions.length,
    });
  } catch (error: any) {
    console.error("[Credits] Error getting history:", error);
    return res.status(500).json({ error: "Failed to get credit history" });
  }
});


router.get("/analytics", async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = req.user.id;
    const analytics = await CreditService.getUsageAnalytics(userId);

    return res.json(analytics);
  } catch (error: any) {
    console.error("[Credits] Error getting analytics:", error);
    return res.status(500).json({ error: "Failed to get credit analytics" });
  }
});

router.get("/packs", getCreditPacks);

router.post("/purchase", authenticate, createCreditPurchaseCheckout);

export default router;

