"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = __importDefault(require("./config/swagger"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const topic_route_1 = __importDefault(require("./modules/topic/topic.route"));
const quiz_route_1 = __importDefault(require("./modules/quiz/quiz.route"));
const results_route_1 = __importDefault(
  require("./modules/results/results.route"),
);
const subscription_routes_1 = __importDefault(
  require("./modules/subscription/subscription.routes"),
);
const admin_routes_1 = __importDefault(require("./modules/admin/admin.routes"));
const document_routes_1 = __importDefault(
  require("./modules/document/document.routes"),
);
const chat_routes_1 = __importDefault(require("./modules/chat/chat.routes"));
const subscription_controller_1 = require("./modules/subscription/subscription.controller");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use((0, cors_1.default)(corsOptions));
app.post(
  "/webhook",
  express_1.default.raw({ type: "application/json" }),
  subscription_controller_1.handleWebhook,
);
app.post(
  "/api/v1/subscription/webhook",
  express_1.default.raw({ type: "application/json" }),
  subscription_controller_1.handleWebhook,
);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(express_1.default.static("public"));
app.use(
  "/api-docs",
  swagger_ui_express_1.default.serve,
  swagger_ui_express_1.default.setup(swagger_1.default),
);
app.get("/", (req, res) => {
  res.json({
    message: "Quiz Backend API is running!",
    endpoints: {
      auth: "/api/v1/auth",
      topics: "/api/v1/topic",
      quizzes: "/api/v1/quiz",
      results: "/api/v1/results",
      subscription: "/api/v1/subscription",
      admin: "/api/v1/admin",
      documents: "/api/v1/documents",
      chat: "/api/v1/chat",
    },
    swagger: "/api-docs",
  });
});
app.use("/api/v1/auth", auth_routes_1.default);
app.use("/api/v1/topic", topic_route_1.default);
app.use("/api/v1/quiz", quiz_route_1.default);
app.use("/api/v1/results", results_route_1.default);
app.use("/api/v1/subscription", subscription_routes_1.default);
app.use("/api/v1/admin", admin_routes_1.default);
app.use("/api/v1/documents", document_routes_1.default);
app.use("/api/v1/chat", chat_routes_1.default);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  console.log(
    `Supabase URL: ${process.env.SUPABASE_URL || "http://127.0.0.1:55321"}`,
  );
  console.log(
    `Google OAuth callback: ${process.env.SUPABASE_URL || "http://127.0.0.1:55321"}/auth/v1/callback`,
  );
});
//# sourceMappingURL=app.js.map
