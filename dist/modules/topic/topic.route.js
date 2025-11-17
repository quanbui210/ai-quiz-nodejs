"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const limit_check_middleware_1 = require("../../middleware/limit-check.middleware");
const topic_controller_1 = require("./topic.controller");
const router = (0, express_1.Router)();
router.get("/list", auth_middleware_1.authenticate, topic_controller_1.listTopics);
router.get("/:id", topic_controller_1.getTopic);
router.post("/create", auth_middleware_1.authenticate, limit_check_middleware_1.checkTopicLimit, topic_controller_1.createTopic);
router.put("/:id", auth_middleware_1.authenticate, topic_controller_1.updateTopic);
router.delete("/:id", auth_middleware_1.authenticate, topic_controller_1.deleteTopic);
exports.default = router;
//# sourceMappingURL=topic.route.js.map