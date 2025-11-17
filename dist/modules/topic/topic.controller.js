"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopic =
  exports.updateTopic =
  exports.createTopic =
  exports.getTopic =
  exports.listTopics =
    void 0;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const usage_1 = require("../../utils/usage");
const listTopics = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const topics = await prisma_1.default.topic.findMany({
      where: { userId: req.user.id },
    });
    return res.json({ topics });
  } catch (error) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to list topics" });
  }
};
exports.listTopics = listTopics;
const getTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const topic = await prisma_1.default.topic.findUnique({
      where: { id },
    });
    return res.json(topic);
  } catch (error) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to get topic" });
  }
};
exports.getTopic = getTopic;
const createTopic = async (req, res) => {
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
    const topic = await prisma_1.default.topic.create({
      data: {
        name,
        userId: req.user.id,
      },
    });
    await (0, usage_1.incrementTopicCount)(req.user.id);
    return res.status(201).json({ topic });
  } catch (error) {
    console.error("Create topic error:", error);
    return res.status(500).json({ error: "Failed to create topic" });
  }
};
exports.createTopic = createTopic;
const updateTopic = async (req, res) => {
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
    const topic = await prisma_1.default.topic.findUnique({
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
    const updatedTopic = await prisma_1.default.topic.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
      },
    });
    return res.json({ topic: updatedTopic });
  } catch (error) {
    console.error("Update topic error:", error);
    return res.status(500).json({ error: "Failed to update topic" });
  }
};
exports.updateTopic = updateTopic;
const deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Topic ID is required" });
    }
    const topic = await prisma_1.default.topic.findUnique({
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
    const quizIds = topic.quizzes.map((q) => q.id);
    const questionIds = topic.quizzes.flatMap((q) =>
      q.questions.map((q) => q.id),
    );
    const attemptIds = topic.quizzes.flatMap((q) =>
      q.attempts.map((a) => a.id),
    );
    const operations = [];
    if (attemptIds.length > 0) {
      operations.push(
        prisma_1.default.answer.deleteMany({
          where: {
            attemptId: { in: attemptIds },
          },
        }),
      );
    }
    if (quizIds.length > 0) {
      operations.push(
        prisma_1.default.quizAttempt.deleteMany({
          where: {
            quizId: { in: quizIds },
          },
        }),
      );
    }
    if (questionIds.length > 0) {
      operations.push(
        prisma_1.default.answer.deleteMany({
          where: {
            questionId: { in: questionIds },
          },
        }),
      );
    }
    if (questionIds.length > 0) {
      operations.push(
        prisma_1.default.explanation.deleteMany({
          where: {
            questionId: { in: questionIds },
          },
        }),
      );
    }
    if (quizIds.length > 0) {
      operations.push(
        prisma_1.default.question.deleteMany({
          where: {
            quizId: { in: quizIds },
          },
        }),
      );
    }
    if (quizIds.length > 0) {
      operations.push(
        prisma_1.default.quiz.deleteMany({
          where: {
            topicId: id,
          },
        }),
      );
    }
    operations.push(
      prisma_1.default.progress.deleteMany({
        where: {
          topicId: id,
        },
      }),
    );
    operations.push(
      prisma_1.default.suggestion.deleteMany({
        where: {
          topicId: id,
        },
      }),
    );
    operations.push(
      prisma_1.default.topic.delete({
        where: { id },
      }),
    );
    await prisma_1.default.$transaction(operations);
    await (0, usage_1.decrementTopicCount)(req.user.id);
    return res.json({
      message: "Topic deleted successfully",
      deletedTopicId: id,
      deletedTopicName: topic.name,
      deletedQuizzesCount: quizIds.length,
    });
  } catch (error) {
    console.error("Delete topic error:", error);
    return res.status(500).json({ error: "Failed to delete topic" });
  }
};
exports.deleteTopic = deleteTopic;
//# sourceMappingURL=topic.controller.js.map
