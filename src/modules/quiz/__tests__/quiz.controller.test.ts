import { Request, Response } from "express";
import { createQuiz, getQuiz, submitAnswers } from "../quiz.controller";

jest.mock("../../../utils/prisma", () => ({
  __esModule: true,
  default: {
    quiz: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    answer: {
      create: jest.fn(),
    },
    question: {
      create: jest.fn(),
    },
    explanation: {
      create: jest.fn(),
    },
  },
}));

import prisma from "../../../utils/prisma";

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
        - Options:
        1. 2
        2. 3
        3. 4
        4. 5
        5. 4
        6. 5
        7. 6
        8. 7
        - Correct Answers:
        1. 4
        2. 6
        - Explanation: Basic math quiz
        - Difficulty: BEGINNER
        - Topic: Math`,
              },
            },
          ],
        }),
      },
    },
  }));
});

describe("Quiz Controller", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };
    jest.clearAllMocks();
  });

  describe("createQuiz", () => {
    it("should create a quiz successfully", async () => {
      const mockQuiz = {
        id: "quiz-123",
        title: "Test Quiz",
        type: "MULTIPLE_CHOICE",
        difficulty: "BEGINNER",
        count: 2,
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
        ],
      };

      (prisma.quiz.create as jest.Mock).mockResolvedValue(mockQuiz);

      mockRequest = {
        body: {
          topic: "Math",
          difficulty: "BEGINNER",
          questionCount: 2,
          quizType: "MULTIPLE_CHOICE",
          timer: 600,
          topicId: "topic-123",
          userId: "user-123",
        },
      };

      await createQuiz(mockRequest as Request, mockResponse as Response);

      expect(prisma.quiz.create).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalled();
    });

    it("should return error when topic is missing", async () => {
      mockRequest = {
        body: {
          difficulty: "BEGINNER",
          questionCount: 2,
          topicId: "topic-123",
          userId: "user-123",
        },
      };

      await createQuiz(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: "topic is required and must be a non-empty string",
      });
    });
  });

  describe("getQuiz", () => {
    it("should return quiz when found", async () => {
      const mockQuiz = {
        id: "quiz-123",
        title: "Test Quiz",
        questions: [],
        topic: { id: "topic-123", name: "Test Topic" },
      };

      (prisma.quiz.findUnique as jest.Mock).mockResolvedValue(mockQuiz);

      mockRequest = {
        params: { id: "quiz-123" },
      };

      await getQuiz(mockRequest as Request, mockResponse as Response);

      expect(prisma.quiz.findUnique).toHaveBeenCalledWith({
        where: { id: "quiz-123" },
        include: expect.any(Object),
      });
      expect(mockJson).toHaveBeenCalledWith(mockQuiz);
    });

    it("should return 404 when quiz not found", async () => {
      (prisma.quiz.findUnique as jest.Mock).mockResolvedValue(null);

      mockRequest = {
        params: { id: "non-existent" },
      };

      await getQuiz(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: "Quiz not found" });
    });
  });

  describe("submitAnswers", () => {
    it("should submit answers and return results", async () => {
      const mockQuiz = {
        id: "quiz-123",
        title: "Test Quiz",
        count: 2,
        questions: [
          {
            id: "q1",
            text: "What is 2 + 2?",
            correct: "4",
            explanation: { content: "Basic addition" },
          },
          {
            id: "q2",
            text: "What is 3 + 3?",
            correct: "6",
            explanation: { content: "Basic addition" },
          },
        ],
      };

      (prisma.quiz.findUnique as jest.Mock).mockResolvedValue(mockQuiz);
      (prisma.quiz.update as jest.Mock).mockResolvedValue(mockQuiz);
      (prisma.answer.create as jest.Mock).mockResolvedValue({});

      mockRequest = {
        params: { quizId: "quiz-123" },
        body: {
          userId: "user-123",
          answers: [
            { questionId: "q1", userAnswer: "4" },
            { questionId: "q2", userAnswer: "6" },
          ],
        },
      };

      await submitAnswers(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          quizId: "quiz-123",
          score: 100,
          correctCount: 2,
          totalQuestions: 2,
        }),
      );
    });
  });
});
