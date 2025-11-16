import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import authRoutes from "./modules/auth/auth.routes";
import topicRoutes from "./modules/topic/topic.route";
import quizRoutes from "./modules/quiz/quiz.route";
import resultsRoutes from "./modules/results/results.route";
import subscriptionRoutes from "./modules/subscription/subscription.routes";
import adminRoutes from "./modules/admin/admin.routes";
import { handleWebhook } from "./modules/subscription/subscription.controller";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));



app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook,
);
app.post(
  "/api/v1/subscription/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /:
 *   get:
 *     summary: API health check
 *     tags: [General]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 endpoints:
 *                   type: object
 *                 swagger:
 *                   type: string
 */
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
    },
    swagger: "/api-docs",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/topic", topicRoutes);
app.use("/api/v1/quiz", quizRoutes);
app.use("/api/v1/results", resultsRoutes);
app.use("/api/v1/subscription", subscriptionRoutes);
app.use("/api/v1/admin", adminRoutes);

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
