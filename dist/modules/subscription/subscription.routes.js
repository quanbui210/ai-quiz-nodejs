"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscription_controller_1 = require("./subscription.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get("/plans", subscription_controller_1.getPlans);
router.get(
  "/me",
  auth_middleware_1.authenticate,
  subscription_controller_1.getMySubscription,
);
router.post(
  "/create-checkout",
  auth_middleware_1.authenticate,
  subscription_controller_1.createCheckoutSession,
);
router.post(
  "/cancel",
  auth_middleware_1.authenticate,
  subscription_controller_1.cancelSubscription,
);
router.post(
  "/resume",
  auth_middleware_1.authenticate,
  subscription_controller_1.resumeSubscription,
);
router.get(
  "/portal",
  auth_middleware_1.authenticate,
  subscription_controller_1.getCustomerPortal,
);
exports.default = router;
//# sourceMappingURL=subscription.routes.js.map
