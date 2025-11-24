import { Router } from "express";
import {
  getDashboard,
  listUsers,
  getUser,
  updateUserLimits,
  changeUserSubscription,
  makeAdmin,
  revokeAdmin,
  banUser,
  unbanUser,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from "./admin.controller";
import { authenticate } from "../../middleware/auth.middleware";
import {
  requireAdmin,
  requireSuperAdmin,
} from "../../middleware/admin.middleware";

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get("/dashboard", getDashboard);

// User management
router.get("/users", listUsers);
router.get("/users/:userId", getUser);
router.put("/users/:userId/limits", updateUserLimits);
router.put("/users/:userId/subscription", changeUserSubscription);
router.post("/users/:userId/make-admin", requireSuperAdmin, makeAdmin);
router.delete("/users/:userId/revoke-admin", requireSuperAdmin, revokeAdmin);
router.post("/users/:userId/ban", banUser);
router.post("/users/:userId/unban", unbanUser);

router.get("/plans", listPlans);
router.post("/plans", requireSuperAdmin, createPlan);
router.put("/plans/:planId", requireSuperAdmin, updatePlan);
router.delete("/plans/:planId", requireSuperAdmin, deletePlan);

export default router;
