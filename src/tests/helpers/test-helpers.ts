import { PrismaClient } from "@prisma/client";
import prisma from "../../utils/prisma";

export async function cleanupTestData() {
  await prisma.answer.deleteMany({});
  await prisma.explanation.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.quiz.deleteMany({});
  await prisma.progress.deleteMany({});
  await prisma.suggestion.deleteMany({});
  await prisma.topic.deleteMany({});
  await prisma.user.deleteMany({});
}

export async function createTestUser(data?: {
  id?: string;
  email?: string;
  name?: string;
}) {
  return prisma.user.create({
    data: {
      id: data?.id || "test-user-id",
      email: data?.email || "test@example.com",
      name: data?.name || "Test User",
    },
  });
}

export async function createTestTopic(
  userId: string,
  data?: { name?: string },
) {
  return prisma.topic.create({
    data: {
      name: data?.name || "Test Topic",
      userId,
    },
  });
}

export async function createTestQuiz(
  userId: string,
  topicId: string,
  data?: { title?: string; count?: number },
) {
  return prisma.quiz.create({
    data: {
      title: data?.title || "Test Quiz",
      type: "MULTIPLE_CHOICE",
      difficulty: "INTERMEDIATE",
      count: data?.count || 3,
      status: "PENDING",
      userId,
      topicId,
    },
  });
}

export async function createTestQuestion(
  quizId: string,
  data?: { text?: string; correct?: string },
) {
  return prisma.question.create({
    data: {
      text: data?.text || "What is 2 + 2?",
      type: "MULTIPLE_CHOICE",
      options: ["2", "3", "4", "5"],
      correct: data?.correct || "4",
      quizId,
    },
  });
}
