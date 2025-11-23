"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const career_controller_1 = require("./career.controller");
const router = (0, express_1.Router)();
router.post("/goals", auth_middleware_1.authenticate, career_controller_1.createCareerGoal);
router.get("/goals", auth_middleware_1.authenticate, career_controller_1.listCareerGoals);
router.get("/goals/:goalId", auth_middleware_1.authenticate, career_controller_1.getCareerGoal);
router.patch("/goals/:goalId/tasks/:taskId", auth_middleware_1.authenticate, career_controller_1.updateCareerTaskStatus);
router.post("/goals/:goalId/regenerate", auth_middleware_1.authenticate, career_controller_1.regenerateCareerRoadmap);
router.get("/goals/:goalId/quiz-suggestions", auth_middleware_1.authenticate, career_controller_1.suggestCareerQuizTopics);
router.get("/goals/:goalId/export", auth_middleware_1.authenticate, career_controller_1.exportCareerRoadmapPDF);
router.delete("/goals/:goalId", auth_middleware_1.authenticate, career_controller_1.deleteCareerGoal);
exports.default = router;
//# sourceMappingURL=career.routes.js.map