import { Request, Response, NextFunction } from "express";
import { CreditService, Feature } from "../services/credit.service";

export const requireCredits = (feature: Feature) => {
  return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { hasCredits, currentBalance, required } =
        await CreditService.hasEnoughCredits(userId, feature);

      if (!hasCredits) {
        return res.status(402).json({
          error: "Insufficient credits",
          code: "INSUFFICIENT_CREDITS",
          details: {
            required,
            current: currentBalance,
            feature,
          },
        });
      }

      req.creditInfo = {
        feature,
        cost: required,
        balance: currentBalance,
      };

      return next();
    } catch (error: any) {
      console.error("[Credit Check] Error:", error);
      return res.status(500).json({ error: "Failed to check credits" });
    }
  };
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      creditInfo?: {
        feature: Feature;
        cost: number;
        balance: number;
      };
    }
  }
}

