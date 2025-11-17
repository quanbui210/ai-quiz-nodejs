"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const results_controller_1 = require("./results.controller");
const router = (0, express_1.Router)();
router.get(
  "/:attemptId",
  auth_middleware_1.authenticate,
  results_controller_1.getResult,
);
router.get(
  "/",
  auth_middleware_1.authenticate,
  results_controller_1.listResults,
);
router.get(
  "/quiz/:quizId",
  auth_middleware_1.authenticate,
  results_controller_1.getQuizResult,
);
router.get(
  "/analytics/me",
  auth_middleware_1.authenticate,
  results_controller_1.getUserStats,
);
exports.default = router;
//# sourceMappingURL=results.route.js.map
