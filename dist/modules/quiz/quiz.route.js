"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const limit_check_middleware_1 = require("../../middleware/limit-check.middleware");
const quiz_controller_1 = require("./quiz.controller");
const router = (0, express_1.Router)();
router.post("/suggest-topic", auth_middleware_1.authenticate, quiz_controller_1.suggestQuizTopic);
router.get("/list/:topicId", auth_middleware_1.authenticate, quiz_controller_1.listQuizzes);
router.post("/validate-topic", auth_middleware_1.authenticate, quiz_controller_1.validateQuizTopic);
router.post("/create", auth_middleware_1.authenticate, limit_check_middleware_1.checkQuizLimit, limit_check_middleware_1.validateModelFromBody, quiz_controller_1.createQuiz);
router.post("/test-create", quiz_controller_1.testCreateQuiz);
router.get("/:id", auth_middleware_1.authenticate, quiz_controller_1.getQuiz);
router.delete("/:id", auth_middleware_1.authenticate, quiz_controller_1.deleteQuiz);
router.post("/:quizId/submit", auth_middleware_1.authenticate, quiz_controller_1.submitAnswers);
router.post("/:quizId/pause", auth_middleware_1.authenticate, quiz_controller_1.pauseQuiz);
router.get("/:quizId/resume", auth_middleware_1.authenticate, quiz_controller_1.resumeQuiz);
exports.default = router;
//# sourceMappingURL=quiz.route.js.map