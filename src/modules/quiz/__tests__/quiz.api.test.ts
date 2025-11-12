import request from "supertest";
import express from "express";
import quizRoutes from "../quiz.route";

jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: `- Title: Test Quiz
                  - Questions:
                  1. What is 2 + 2?
                  2. What is 3 + 3?
                  3. What is 4 + 4?
                  - Options:
                  1. 2
                  2. 3
                  3. 4
                  4. 5
                  5. 4
                  6. 5
                  7. 6
                  8. 7
                  9. 6
                  10. 7
                  11. 8
                  12. 9
                  - Correct Answers:
                  1. 4
                  2. 6
                  3. 8
                  - Explanation: Basic math quiz
                  - Difficulty: INTERMEDIATE
                  - Topic: JavaScript`,
              },
            },
          ],
        }),
      },
    },
  }));
});

jest.mock("../../../utils/prisma", () => ({
  __esModule: true,
  default: {
    quiz: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    topic: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    answer: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    explanation: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    question: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    progress: {
      deleteMany: jest.fn(),
    },
    suggestion: {
      deleteMany: jest.fn(),
    },
  },
}));

import prisma from "../../../utils/prisma";

const app = express();
app.use(express.json());
app.use("/api/v1/quiz", quizRoutes);

describe("Quiz API Integration Tests", () => {
  const testUser = { id: "test-user-id", email: "test@example.com" };
  const testTopic = {
    id: "test-topic-id",
    name: "Test Topic",
    userId: testUser.id,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/quiz/create", () => {
    it("should return 400 when topic is missing", async () => {
      const response = await request(app).post("/api/v1/quiz/create").send({
        difficulty: "INTERMEDIATE",
        questionCount: 3,
        topicId: testTopic.id,
        userId: testUser.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("topic is required");
    });

    it("should return 400 when difficulty is invalid", async () => {
      const response = await request(app).post("/api/v1/quiz/create").send({
        topic: "JavaScript",
        difficulty: "INVALID",
        questionCount: 3,
        topicId: testTopic.id,
        userId: testUser.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("difficulty");
    });
    it("should return 201 when quiz is created successfully", async () => {
      const mockQuiz = {
        id: "quiz-123",
        title: "Test Quiz",
        type: "MULTIPLE_CHOICE",
        difficulty: "INTERMEDIATE",
        count: 3,
        timer: 600,
        status: "PENDING",
        createdAt: new Date(),
        questions: [
          {
            id: "q1",
            text: "What is 2 + 2?",
            type: "MULTIPLE_CHOICE",
            options: ["2", "3", "4", "5"],
          },
          {
            id: "q2",
            text: "What is 3 + 3?",
            type: "MULTIPLE_CHOICE",
            options: ["4", "5", "6", "7"],
          },
          {
            id: "q3",
            text: "What is 4 + 4?",
            type: "MULTIPLE_CHOICE",
            options: ["6", "7", "8", "9"],
          },
        ],
      };

      (prisma.quiz.create as jest.Mock).mockResolvedValue(mockQuiz);

      const response = await request(app).post("/api/v1/quiz/create").send({
        topic: "JavaScript",
        difficulty: "INTERMEDIATE",
        questionCount: 3,
        topicId: testTopic.id,
        userId: testUser.id,
        quizType: "MULTIPLE_CHOICE",
        timer: 600,
      });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe("Test Quiz");
      expect(response.body.type).toBe("MULTIPLE_CHOICE");
      expect(response.body.difficulty).toBe("INTERMEDIATE");
      expect(response.body.count).toBe(3);
      expect(response.body.timer).toBe(600);
      expect(response.body.status).toBe("PENDING");
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.questions).toBeDefined();
      expect(response.body.questions.length).toBe(3);
      expect(response.body.questions[0].correct).toBeUndefined();
    });
  });

  describe("GET /api/v1/quiz/:id", () => {
    it("should return 404 for non-existent quiz", async () => {
      (prisma.quiz.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get("/api/v1/quiz/non-existent-id");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Quiz not found");
    });
  });
});
