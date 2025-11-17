import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AttemptStatus, Difficulty } from "@prisma/client";

export const getQuizResult = async (
  req: Request & { user?: any },
  res: Response,
) => {
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
        status: AttemptStatus.COMPLETED,
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
        message:
          "You haven't submitted answers for this quiz yet. Please submit your answers first using POST /api/v1/quiz/:quizId/submit",
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

    const result = {
      id: attempt.id,
      quiz: attempt.quiz,
      score: attempt.score,
      correctCount: attempt.correctCount,
      totalQuestions: attempt.totalQuestions,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      answers: attempt.answers.map(
        (answer: {
          questionId: string;
          question: {
            text: string;
            correct: string | null;
            explanation?: { content: string } | null;
          };
          userAnswer: string;
          isCorrect: boolean;
        }) => ({
          questionId: answer.questionId,
          questionText: answer.question.text,
          userAnswer: answer.userAnswer,
          correctAnswer: answer.question.correct,
          isCorrect: answer.isCorrect,
          explanation: answer.question.explanation?.content || null,
        }),
      ),
    };

    return res.json({ result });
  } catch (error: any) {
    console.error("Get quiz result error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get quiz result", message: error.message });
  }
};

export const getResult = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    const { attemptId } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        status: AttemptStatus.COMPLETED,
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
    });

    if (!attempt) {
      return res.status(404).json({ error: "Quiz attempt not found" });
    }

    if (attempt.userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = {
      id: attempt.id,
      quiz: attempt.quiz,
      score: attempt.score,
      correctCount: attempt.correctCount,
      totalQuestions: attempt.totalQuestions,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      answers: attempt.answers.map(
        (answer: {
          questionId: string;
          question: {
            text: string;
            correct: string | null;
            explanation?: { content: string } | null;
          };
          userAnswer: string;
          isCorrect: boolean;
        }) => ({
          questionId: answer.questionId,
          questionText: answer.question.text,
          userAnswer: answer.userAnswer,
          correctAnswer: answer.question.correct,
          isCorrect: answer.isCorrect,
          explanation: answer.question.explanation?.content || null,
        }),
      ),
    };

    return res.json({ result });
  } catch (error: any) {
    console.error("Get result error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get result", message: error.message });
  }
};

export const listResults = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { quizId, limit = 50, offset = 0 } = req.query;

    const where: any = {
      userId: req.user.id,
      status: AttemptStatus.COMPLETED,
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
      attempts: attempts.map(
        (attempt: {
          id: string;
          quiz: {
            id: string;
            title: string;
            difficulty: Difficulty;
            topic: { id: string; name: string } | null;
          };
          score: number | null;
          correctCount: number | null;
          totalQuestions: number;
          timeSpent: number | null;
          completedAt: Date | null;
        }) => ({
          id: attempt.id,
          quiz: attempt.quiz,
          score: attempt.score,
          correctCount: attempt.correctCount,
          totalQuestions: attempt.totalQuestions,
          timeSpent: attempt.timeSpent,
          completedAt: attempt.completedAt,
        }),
      ),
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    console.error("List results error:", error);
    return res
      .status(500)
      .json({ error: "Failed to list results", message: error.message });
  }
};

export const getUserStats = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userId = req.user.id;

    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek);

    const [totalTopics, totalQuizzes, totalAttempts, totalQuestions] =
      await Promise.all([
        prisma.topic.count({ where: { userId } }),
        prisma.quiz.count({ where: { userId } }),
        prisma.quizAttempt.count({
          where: { userId, status: AttemptStatus.COMPLETED },
        }),
        prisma.question.count({
          where: { quiz: { userId } },
        }),
      ]);

    const [averageScore, bestScore, worstScore] = await Promise.all([
      prisma.quizAttempt.aggregate({
        where: { userId, status: AttemptStatus.COMPLETED },
        _avg: { score: true },
      }),
      prisma.quizAttempt.findFirst({
        where: { userId, status: AttemptStatus.COMPLETED },
        orderBy: { score: "desc" },
        select: {
          score: true,
          quiz: { select: { title: true, id: true } },
          completedAt: true,
        },
      }),
      prisma.quizAttempt.findFirst({
        where: { userId, status: AttemptStatus.COMPLETED },
        orderBy: { score: "asc" },
        select: {
          score: true,
          quiz: { select: { title: true, id: true } },
          completedAt: true,
        },
      }),
    ]);

    const [quizzesWithTimer, timeSetStats] = await Promise.all([
      prisma.quiz.findMany({
        where: { userId, timer: { not: null } },
        select: { id: true },
      }),
      prisma.quiz.aggregate({
        where: { userId, timer: { not: null } },
        _sum: { timer: true },
        _avg: { timer: true },
      }),
    ]);

    const quizIdsWithTimer = quizzesWithTimer.map((q: { id: string }) => q.id);
    const totalTimeSet = { _sum: { timer: timeSetStats._sum.timer } };
    const averageTimeSet = { _avg: { timer: timeSetStats._avg.timer } };

    const timeSpentStats =
      quizIdsWithTimer.length > 0
        ? await prisma.quizAttempt.aggregate({
            where: {
              userId,
              quizId: { in: quizIdsWithTimer },
              timeSpent: { not: null },
              status: AttemptStatus.COMPLETED,
            },
            _sum: { timeSpent: true },
            _avg: { timeSpent: true },
          })
        : { _sum: { timeSpent: null }, _avg: { timeSpent: null } };

    const totalTimeSpent = {
      _sum: { timeSpent: timeSpentStats._sum.timeSpent },
    };
    const averageTimeSpent = {
      _avg: { timeSpent: timeSpentStats._avg.timeSpent },
    };

    const attemptsByDifficulty = await prisma.quizAttempt.groupBy({
      by: ["quizId"],
      where: { userId, status: AttemptStatus.COMPLETED },
      _count: { id: true },
      _avg: { score: true, timeSpent: true },
    });

    const quizDetails = await prisma.quiz.findMany({
      where: {
        id: {
          in: attemptsByDifficulty.map((a: { quizId: string }) => a.quizId),
        },
      },
      select: {
        id: true,
        title: true,
        difficulty: true,
        timer: true,
        topic: { select: { name: true } },
      },
    });

    const attemptsWithDetails = attemptsByDifficulty.map(
      (attempt: {
        quizId: string;
        _count: { id: number };
        _avg: { score: number | null; timeSpent: number | null };
      }) => {
        const quiz = quizDetails.find(
          (q: { id: string }) => q.id === attempt.quizId,
        );
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
      },
    );

    const recentAttempts = await prisma.quizAttempt.findMany({
      where: { userId, status: AttemptStatus.COMPLETED },
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

    const [thisWeekAttempts, lastWeekAttempts, thisWeekTopics, lastWeekTopics] =
      await Promise.all([
        prisma.quizAttempt.count({
          where: {
            userId,
            completedAt: { gte: startOfWeek },
            status: AttemptStatus.COMPLETED,
          },
        }),
        prisma.quizAttempt.count({
          where: {
            userId,
            completedAt: { gte: startOfLastWeek, lt: endOfLastWeek },
            status: AttemptStatus.COMPLETED,
          },
        }),
        prisma.topic.count({
          where: {
            userId,
            createdAt: { gte: startOfWeek },
          },
        }),
        prisma.topic.count({
          where: {
            userId,
            createdAt: { gte: startOfLastWeek, lt: endOfLastWeek },
          },
        }),
      ]);

    const [thisWeekAverageScore, lastWeekAverageScore] = await Promise.all([
      prisma.quizAttempt.aggregate({
        where: {
          userId,
          completedAt: { gte: startOfWeek },
          status: AttemptStatus.COMPLETED,
        },
        _avg: { score: true },
      }),
      prisma.quizAttempt.aggregate({
        where: {
          userId,
          completedAt: { gte: startOfLastWeek, lt: endOfLastWeek },
          status: AttemptStatus.COMPLETED,
        },
        _avg: { score: true },
      }),
    ]);

    const topicsWithProgress = await prisma.topic.findMany({
      where: { userId },
      include: {
        quizzes: {
          include: {
            attempts: {
              where: { userId, status: AttemptStatus.COMPLETED },
              select: {
                score: true,
                completedAt: true,
              },
            },
          },
        },
      },
    });

    const topicsProgress = topicsWithProgress.map(
      (topic: {
        id: string;
        name: string;
        quizzes: Array<{
          attempts: Array<{ score: number | null; completedAt: Date | null }>;
        }>;
      }) => {
        const allQuizzes = topic.quizzes;
        const totalQuizzes = allQuizzes.length;
        const completedQuizzes = allQuizzes.filter(
          (q: { attempts: Array<any> }) => q.attempts && q.attempts.length > 0,
        ).length;
        const allScores = allQuizzes.flatMap(
          (q: { attempts: Array<{ score: number | null }> }) =>
            q.attempts.map((a: { score: number | null }) => a.score || 0),
        );
        const averageScore =
          allScores.length > 0
            ? (allScores?.reduce(
                (sum: number | null, score: number | null) =>
                  sum ? sum + (score || 0) : 0,
                0,
              ) || 0) / allScores.length
            : 0;

        const allAttemptDates = allQuizzes
          .flatMap((q: { attempts: Array<{ completedAt: Date | null }> }) =>
            q.attempts.map((a: { completedAt: Date | null }) => a.completedAt),
          )
          .filter((date: Date | null): date is Date => date !== null);

        return {
          topicId: topic.id,
          topicName: topic.name,
          totalQuizzes,
          completedQuizzes,
          progressPercentage:
            totalQuizzes > 0
              ? Math.round((completedQuizzes / totalQuizzes) * 100)
              : 0,
          averageScore: Math.round(averageScore * 100) / 100,
          lastAttemptAt:
            allAttemptDates.length > 0
              ? allAttemptDates.sort(
                  (a: Date, b: Date) => b.getTime() - a.getTime(),
                )[0]
              : null,
        };
      },
    );

    const getTimeSeriesData = async (days: number) => {
      const now = new Date();
      const endDate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
      const startDate = new Date(endDate);
      startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
      startDate.setUTCHours(0, 0, 0, 0);

      const attempts = await prisma.quizAttempt.findMany({
        where: {
          userId,
          completedAt: {
            gte: startDate,
            lte: endDate,
          },
          status: AttemptStatus.COMPLETED,
        },
        select: {
          score: true,
          completedAt: true,
        },
        orderBy: { completedAt: "asc" },
      });

      const dailyData: { [key: string]: number[] } = {};
      attempts.forEach(
        (attempt: { completedAt: Date | null; score: number | null }) => {
          if (attempt.completedAt) {
            const attemptDate = new Date(attempt.completedAt);
            const dateKey = attemptDate.toISOString().split("T")[0];
            if (dateKey) {
              if (!dailyData[dateKey]) {
                dailyData[dateKey] = [];
              }
              dailyData[dateKey].push(attempt.score || 0);
            }
          }
        },
      );

      const result: Array<{
        date: string;
        averageScore: number | null;
        attemptCount: number;
      }> = [];

      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setUTCDate(startDate.getUTCDate() + i);
        const dateKey = date.toISOString().split("T")[0];

        if (dateKey) {
          const scores = dailyData[dateKey] || [];
          const averageScore =
            scores.length > 0
              ? scores.reduce((sum: number, s: number) => sum + s, 0) /
                scores.length
              : null;

          result.push({
            date: dateKey,
            averageScore: averageScore
              ? Math.round(averageScore * 100) / 100
              : null,
            attemptCount: scores.length,
          });
        }
      }

      return result;
    };

    const [performance7Days, performance30Days, performance90Days] =
      await Promise.all([
        getTimeSeriesData(7),
        getTimeSeriesData(30),
        getTimeSeriesData(90),
      ]);

    const overallProgress =
      Math.round((averageScore._avg?.score || 0) * 100) / 100;
    const thisWeekProgress =
      Math.round((thisWeekAverageScore._avg?.score || 0) * 100) / 100;
    const lastWeekProgress =
      Math.round((lastWeekAverageScore._avg?.score || 0) * 100) / 100;
    const progressChange = thisWeekProgress - lastWeekProgress;

    const timeEfficiency =
      averageTimeSet._avg.timer && averageTimeSpent._avg.timeSpent
        ? (averageTimeSpent._avg.timeSpent / averageTimeSet._avg.timer) * 100
        : null;

    return res.json({
      analytics: {
        overview: {
          totalTopics,
          totalQuizzes,
          totalAttempts,
          totalQuestions,
          overallProgress,
        },
        weeklyComparison: {
          attempts: {
            thisWeek: thisWeekAttempts,
            lastWeek: lastWeekAttempts,
            change: thisWeekAttempts - lastWeekAttempts,
          },
          topics: {
            thisWeek: thisWeekTopics,
            lastWeek: lastWeekTopics,
            change: thisWeekTopics - lastWeekTopics,
          },
          progress: {
            thisWeek: thisWeekProgress,
            lastWeek: lastWeekProgress,
            change: progressChange,
          },
        },
        performance: {
          averageScore: overallProgress,
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
          timeSeries: {
            last7Days: performance7Days,
            last30Days: performance30Days,
            last90Days: performance90Days,
          },
        },
        time: {
          totalTimeSpent: totalTimeSpent._sum.timeSpent || 0,
          averageTimeSpent:
            Math.round((averageTimeSpent._avg.timeSpent || 0) * 100) / 100,
          totalTimeSet: totalTimeSet._sum.timer || 0,
          averageTimeSet:
            Math.round((averageTimeSet._avg.timer || 0) * 100) / 100,
          timeEfficiency: timeEfficiency
            ? Math.round(timeEfficiency * 100) / 100
            : null,
        },
        topics: topicsProgress,
        attemptsByQuiz: attemptsWithDetails,
        recentAttempts: recentAttempts.map(
          (attempt: {
            id: string;
            quiz: {
              id: string;
              title: string;
              difficulty: Difficulty;
              topic: { name: string } | null;
            };
            score: number | null;
            correctCount: number | null;
            totalQuestions: number;
            timeSpent: number | null;
            completedAt: Date | null;
          }) => ({
            id: attempt.id,
            quizId: attempt.quiz.id,
            quizTitle: attempt.quiz.title,
            quizDifficulty: attempt.quiz.difficulty,
            topicName: attempt.quiz.topic?.name || null,
            score: attempt.score,
            correctCount: attempt.correctCount,
            totalQuestions: attempt.totalQuestions,
            timeSpent: attempt.timeSpent,
            completedAt: attempt.completedAt,
          }),
        ),
      },
    });
  } catch (error: any) {
    console.error("Get user analytics error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get user analytics", message: error.message });
  }
};
