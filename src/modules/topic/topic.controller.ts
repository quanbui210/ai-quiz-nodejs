import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { incrementTopicCount, decrementTopicCount } from "../../utils/usage";

export const listTopics = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const topics = await prisma.topic.findMany({
      where: { userId: req.user.id },
    });
    return res.json({ topics });
  } catch (error: any) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to list topics" });
  }
};

export const getTopic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const topic = await prisma.topic.findUnique({
      where: { id },
    });
    return res.json(topic);
  } catch (error: any) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to get topic" });
  }
};

export const createTopic = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "name is required and must be a non-empty string" });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        userId: req.user.id,
      },
    });

    await incrementTopicCount(req.user.id);

    return res.status(201).json({ topic });
  } catch (error: any) {
    console.error("Create topic error:", error);
    return res.status(500).json({ error: "Failed to create topic" });
  }
};

export const updateTopic = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Topic ID is required" });
    }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res
          .status(400)
          .json({ error: "name must be a non-empty string" });
      }
    }

    const topic = await prisma.topic.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
      },
    });

    if (!topic) {
      return res.status(404).json({ error: "Topic not found" });
    }

    if (topic.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "You don't have permission to update this topic" });
    }

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
      },
    });

    return res.json({ topic: updatedTopic });
  } catch (error: any) {
    console.error("Update topic error:", error);
    return res.status(500).json({ error: "Failed to update topic" });
  }
};

export const deleteTopic = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Topic ID is required" });
    }

    const topic = await prisma.topic.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        quizzes: {
          select: {
            id: true,
            questions: {
              select: { id: true },
            },
            attempts: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!topic) {
      return res.status(404).json({ error: "Topic not found" });
    }

    if (topic.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "You don't have permission to delete this topic" });
    }

    const quizIds = topic.quizzes.map((q: { id: string }) => q.id);
    const questionIds = topic.quizzes.flatMap(
      (q: { questions: Array<{ id: string }> }) =>
        q.questions.map((q: { id: string }) => q.id),
    );
    const attemptIds = topic.quizzes.flatMap(
      (q: { attempts: Array<{ id: string }> }) =>
        q.attempts.map((a: { id: string }) => a.id),
    );

    const operations: any[] = [];

    if (attemptIds.length > 0) {
      operations.push(
        prisma.answer.deleteMany({
          where: {
            attemptId: { in: attemptIds },
          },
        }),
      );
    }

    if (quizIds.length > 0) {
      operations.push(
        prisma.quizAttempt.deleteMany({
          where: {
            quizId: { in: quizIds },
          },
        }),
      );
    }

    if (questionIds.length > 0) {
      operations.push(
        prisma.answer.deleteMany({
          where: {
            questionId: { in: questionIds },
          },
        }),
      );
    }

    if (questionIds.length > 0) {
      operations.push(
        prisma.explanation.deleteMany({
          where: {
            questionId: { in: questionIds },
          },
        }),
      );
    }

    if (quizIds.length > 0) {
      operations.push(
        prisma.question.deleteMany({
          where: {
            quizId: { in: quizIds },
          },
        }),
      );
    }

    if (quizIds.length > 0) {
      operations.push(
        prisma.quiz.deleteMany({
          where: {
            topicId: id,
          },
        }),
      );
    }

    operations.push(
      prisma.progress.deleteMany({
        where: {
          topicId: id,
        },
      }),
    );

    operations.push(
      prisma.suggestion.deleteMany({
        where: {
          topicId: id,
        },
      }),
    );

    operations.push(
      prisma.topic.delete({
        where: { id },
      }),
    );

    await prisma.$transaction(operations);

    await decrementTopicCount(req.user.id);

    return res.json({
      message: "Topic deleted successfully",
      deletedTopicId: id,
      deletedTopicName: topic.name,
      deletedQuizzesCount: quizIds.length,
    });
  } catch (error: any) {
    console.error("Delete topic error:", error);
    return res.status(500).json({ error: "Failed to delete topic" });
  }
};
