import { Router } from "express";
import {
  getPlans,
  getMySubscription,
  createCheckoutSession,
  cancelSubscription,
  resumeSubscription,
  getCustomerPortal,
} from "./subscription.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/plans", getPlans);

router.get("/me", authenticate, getMySubscription);
router.post("/create-checkout", authenticate, createCheckoutSession);
router.post("/cancel", authenticate, cancelSubscription);
router.post("/resume", authenticate, resumeSubscription);
router.get("/portal", authenticate, getCustomerPortal);

export default router;
