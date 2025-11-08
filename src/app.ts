import express from "express";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes";
import topicRoutes from "./modules/topic/topic.route";
import quizRoutes from "./modules/quiz/quiz.route";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({
    message: "Quiz Backend API is running!",
    endpoints: {
      auth: "/api/auth",
      googleLogin: "/api/auth/google",
      callback: "/api/auth/callback",
      session: "/api/auth/session",
      currentUser: "/api/auth/me",
      signOut: "/api/auth/signout",
    },
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/topic", topicRoutes);
app.use("/api/v1/quiz", quizRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(
    `Supabase URL: ${process.env.SUPABASE_URL || "http://127.0.0.1:55321"}`,
  );
  console.log(
    `Google OAuth callback: ${process.env.SUPABASE_URL || "http://127.0.0.1:55321"}/auth/v1/callback`,
  );
});
