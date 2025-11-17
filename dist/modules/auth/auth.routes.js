"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const router = (0, express_1.Router)();
router.get("/login", auth_controller_1.loginWithGoogle);
router.post("/login", auth_controller_1.loginWithEmail);
router.get("/callback", auth_controller_1.handleCallback);
router.post("/callback", auth_controller_1.handleCallback);
router.get("/session", auth_controller_1.getSession);
router.get("/me", auth_controller_1.getCurrentUser);
router.post("/signout", auth_controller_1.signOut);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map