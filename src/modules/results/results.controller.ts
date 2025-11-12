import { Request, Response } from "express";
import prisma from "../../utils/prisma";


export const getQuizResult = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { quizId } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }


    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        userId: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

  
    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        quizId,
        userId: req.user.id,
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            type: true,
            difficulty: true,
            topic: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        answers: {
          include: {
            question: {
              include: {
                explanation: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    if (!attempt) {
      const anyAttempts = await prisma.quizAttempt.findFirst({
        where: { quizId },
        select: { id: true, userId: true },
      });

      return res.status(404).json({ 
        error: "No quiz attempt found",
        message: "You haven't submitted answers for this quiz yet. Please submit your answers first using POST /api/v1/quiz/:quizId/submit",
        quizId,
        quizTitle: quiz.title,
        debug: {
          requestedUserId: req.user.id,
          quizOwnerId: quiz.userId,
          anyAttemptsExist: !!anyAttempts,
          attemptUserId: anyAttempts?.userId || null,
        },
      });
    }

    // Format the result
    const result = {
      id: attempt.id,
      quiz: attempt.quiz,
      score: attempt.score,
      correctCount: attempt.correctCount,
      totalQuestions: attempt.totalQuestions,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      answers: attempt.answers.map((answer) => ({
        questionId: answer.questionId,
        questionText: answer.question.text,
        userAnswer: answer.userAnswer,
        correctAnswer: answer.question.correct,
        isCorrect: answer.isCorrect,
        explanation: answer.question.explanation?.content || null,
      })),
    };

    return res.json({ result });
  } catch (error: any) {
    console.error("Get quiz result error:", error);
    return res.status(500).json({ error: "Failed to get quiz result", message: error.message });
  }
};


export const getResult = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { attemptId } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            type: true,
            difficulty: true,
            topic: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        answers: {
          include: {
            question: {
              include: {
                explanation: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!attempt) {
      return res.status(404).json({ error: "Quiz attempt not found" });
    }

    if (attempt.userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Format the result
    const result = {
      id: attempt.id,
      quiz: attempt.quiz,
      score: attempt.score,
      correctCount: attempt.correctCount,
      totalQuestions: attempt.totalQuestions,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      answers: attempt.answers.map((answer) => ({
        questionId: answer.questionId,
        questionText: answer.question.text,
        userAnswer: answer.userAnswer,
        correctAnswer: answer.question.correct,
        isCorrect: answer.isCorrect,
        explanation: answer.question.explanation?.content || null,
      })),
    };

    return res.json({ result });
  } catch (error: any) {
    console.error("Get result error:", error);
    return res.status(500).json({ error: "Failed to get result", message: error.message });
  }
};


export const listResults = async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { quizId, limit = 50, offset = 0 } = req.query;

    const where: any = {
      userId: req.user.id,
    };

    if (quizId) {
      where.quizId = quizId as string;
    }

    const [attempts, total] = await Promise.all([
      prisma.quizAttempt.findMany({
        where,
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              topic: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          completedAt: "desc",
        },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.quizAttempt.count({ where }),
    ]);

    return res.json({
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        quiz: attempt.quiz,
        score: attempt.score,
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        timeSpent: attempt.timeSpent,
        completedAt: attempt.completedAt,
      })),
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    console.error("List results error:", error);
    return res.status(500).json({ error: "Failed to list results", message: error.message });
  }
};

/**
 * Get comprehensive user analytics for dashboard
 * Includes all topics, quizzes, attempts, and performance metrics
 */
export const getUserStats = async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userId = req.user.id;

    // Get all basic counts
    const [
      totalTopics,
      totalQuizzes,
      totalAttempts,
      totalQuestions,
    ] = await Promise.all([
      prisma.topic.count({ where: { userId } }),
      prisma.quiz.count({ where: { userId } }),
      prisma.quizAttempt.count({ where: { userId } }),
      prisma.question.count({
        where: { quiz: { userId } },
      }),
    ]);

    // Get attempt statistics
    const [
      averageScore,
      bestScore,
      worstScore,
      totalTimeSpent,
      averageTimeSpent,
      totalTimeSet,
      averageTimeSet,
    ] = await Promise.all([
      prisma.quizAttempt.aggregate({
        where: { userId },
        _avg: { score: true },
      }),
      prisma.quizAttempt.findFirst({
        where: { userId },
        orderBy: { score: "desc" },
        select: {
          score: true,
          quiz: { select: { title: true, id: true } },
          completedAt: true,
        },
      }),
      prisma.quizAttempt.findFirst({
        where: { userId },
        orderBy: { score: "asc" },
        select: {
          score: true,
          quiz: { select: { title: true, id: true } },
          completedAt: true,
        },
      }),
      prisma.quizAttempt.aggregate({
        where: { userId },
        _sum: { timeSpent: true },
      }),
      prisma.quizAttempt.aggregate({
        where: { userId, timeSpent: { not: null } },
        _avg: { timeSpent: true },
      }),
      prisma.quiz.aggregate({
        where: { userId, timer: { not: null } },
        _sum: { timer: true },
      }),
      prisma.quiz.aggregate({
        where: { userId, timer: { not: null } },
        _avg: { timer: true },
      }),
    ]);

    // Get attempts by difficulty
    const attemptsByDifficulty = await prisma.quizAttempt.groupBy({
      by: ["quizId"],
      where: { userId },
      _count: { id: true },
      _avg: { score: true, timeSpent: true },
    });

    // Get quiz details for attempts
    const quizDetails = await prisma.quiz.findMany({
      where: {
        id: { in: attemptsByDifficulty.map((a) => a.quizId) },
      },
      select: {
        id: true,
        title: true,
        difficulty: true,
        timer: true,
        topic: { select: { name: true } },
      },
    });

    const attemptsWithDetails = attemptsByDifficulty.map((attempt) => {
      const quiz = quizDetails.find((q) => q.id === attempt.quizId);
      return {
        quizId: attempt.quizId,
        quizTitle: quiz?.title || "Unknown",
        quizDifficulty: quiz?.difficulty || null,
        topicName: quiz?.topic?.name || null,
        attemptCount: attempt._count.id,
        averageScore: attempt._avg.score || 0,
        averageTimeSpent: attempt._avg.timeSpent || null,
        timeSet: quiz?.timer || null,
      };
    });

    // Get recent attempts (last 10)
    const recentAttempts = await prisma.quizAttempt.findMany({
      where: { userId },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            topic: { select: { name: true } },
          },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    // Calculate time efficiency (average time spent vs time set)
    const timeEfficiency = averageTimeSet._avg.timer && averageTimeSpent._avg.timeSpent
      ? ((averageTimeSpent._avg.timeSpent / averageTimeSet._avg.timer) * 100)
      : null;

    return res.json({
      analytics: {
        overview: {
          totalTopics,
          totalQuizzes,
          totalAttempts,
          totalQuestions,
        },
        performance: {
          averageScore: Math.round((averageScore._avg.score || 0) * 100) / 100,
          bestScore: bestScore
            ? {
                score: bestScore.score,
                quizId: bestScore.quiz.id,
                quizTitle: bestScore.quiz.title,
                completedAt: bestScore.completedAt,
              }
            : null,
          worstScore: worstScore
            ? {
                score: worstScore.score,
                quizId: worstScore.quiz.id,
                quizTitle: worstScore.quiz.title,
                completedAt: worstScore.completedAt,
              }
            : null,
        },
        time: {
          totalTimeSpent: totalTimeSpent._sum.timeSpent || 0, // seconds
          averageTimeSpent: Math.round((averageTimeSpent._avg.timeSpent || 0) * 100) / 100, // seconds
          totalTimeSet: totalTimeSet._sum.timer || 0, // seconds
          averageTimeSet: Math.round((averageTimeSet._avg.timer || 0) * 100) / 100, // seconds
          timeEfficiency: timeEfficiency ? Math.round(timeEfficiency * 100) / 100 : null, // percentage
        },
        attemptsByQuiz: attemptsWithDetails,
        recentAttempts: recentAttempts.map((attempt) => ({
          id: attempt.id,
          quizId: attempt.quizId,
          quizTitle: attempt.quiz.title,
          quizDifficulty: attempt.quiz.difficulty,
          topicName: attempt.quiz.topic?.name || null,
          score: attempt.score,
          correctCount: attempt.correctCount,
          totalQuestions: attempt.totalQuestions,
          timeSpent: attempt.timeSpent,
          completedAt: attempt.completedAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("Get user analytics error:", error);
    return res.status(500).json({ error: "Failed to get user analytics", message: error.message });
  }
};

