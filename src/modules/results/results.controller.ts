import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import { AttemptStatus, Difficulty, DocumentStatus } from "@prisma/client";
import { CreditService } from "../../services/credit.service";

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

    // Calculate date ranges
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


    const [
      totalInterviewSessions,
      completedInterviewSessions,
      interviewSessionsThisWeek,
      interviewSessionsLastWeek,
    ] = await Promise.all([
      prisma.interviewSession.count({ where: { userId } }),
      prisma.interviewSession.count({
        where: { userId, status: "COMPLETED" },
      }),
      prisma.interviewSession.count({
        where: {
          userId,
          createdAt: { gte: startOfWeek },
        },
      }),
      prisma.interviewSession.count({
        where: {
          userId,
          createdAt: { gte: startOfLastWeek, lt: endOfLastWeek },
        },
      }),
    ]);

    const interviewScoreStats = await prisma.interviewSession.aggregate({
      where: {
        userId,
        status: "COMPLETED",
        overallScore: { not: null },
      },
      _avg: { overallScore: true },
      _max: { overallScore: true },
    });

    const interviewSessionsByLevel = await prisma.interviewSession.groupBy({
      by: ["level"],
      where: { userId },
      _count: { id: true },
    });

    const recentInterviewSessions = await prisma.interviewSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        role: true,
        level: true,
        status: true,
        overallScore: true,
        completedAt: true,
        createdAt: true,
      },
    });

    
    // 3. CAREER ROADMAP ANALYTICS
    
    const [
      totalCareerGoals,
      activeCareerGoals,
      completedCareerGoals,
      careerGoalsThisWeek,
      careerGoalsLastWeek,
    ] = await Promise.all([
      prisma.careerGoal.count({ where: { userId } }),
      prisma.careerGoal.count({
        where: { userId, status: "ACTIVE" },
      }),
      prisma.careerGoal.count({
        where: { userId, status: "COMPLETED" },
      }),
      prisma.careerGoal.count({
        where: {
          userId,
          createdAt: { gte: startOfWeek },
        },
      }),
      prisma.careerGoal.count({
        where: {
          userId,
          createdAt: { gte: startOfLastWeek, lt: endOfLastWeek },
        },
      }),
    ]);

    const careerGoalsWithProgress = await prisma.careerGoal.findMany({
      where: { userId },
      select: {
        progress: true,
      },
    });

    const totalRoadmapTasks = await prisma.careerTask.count({
      where: {
        goal: { userId },
      },
    });

    const completedRoadmapTasks = await prisma.careerTask.count({
      where: {
        goal: { userId },
        status: "COMPLETED",
      },
    });

    const roadmapTasksThisWeek = await prisma.careerTask.count({
      where: {
        goal: { userId },
        completedAt: { gte: startOfWeek },
        status: "COMPLETED",
      },
    });

    const roadmapTasksLastWeek = await prisma.careerTask.count({
      where: {
        goal: { userId },
        completedAt: { gte: startOfLastWeek, lt: endOfLastWeek },
        status: "COMPLETED",
      },
    });

    const averageRoadmapProgress =
      careerGoalsWithProgress.length > 0
        ? Math.round(
            (careerGoalsWithProgress.reduce(
              (sum, goal) => sum + goal.progress,
              0,
            ) /
              careerGoalsWithProgress.length) *
              100,
          ) / 100
        : 0;

    const milestonesAchieved = await prisma.careerMilestone.count({
      where: {
        goal: { userId },
        isAchieved: true,
      },
    });

    
    
    const [
      totalResumes,
      analyzedResumes,
      resumesThisWeek,
      resumesLastWeek,
    ] = await Promise.all([
      prisma.resume.count({ where: { userId } }),
      prisma.resume.count({
        where: { userId, status: "READY", analyzedAt: { not: null } },
      }),
      prisma.resume.count({
        where: {
          userId,
          createdAt: { gte: startOfWeek },
        },
      }),
      prisma.resume.count({
        where: {
          userId,
          createdAt: { gte: startOfLastWeek, lt: endOfLastWeek },
        },
      }),
    ]);

    const resumeScoreStats = await prisma.resume.aggregate({
      where: {
        userId,
        analysisScore: { not: null },
      },
      _avg: { analysisScore: true },
      _max: { analysisScore: true },
    });

    const recentResumes = await prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        filename: true,
        analysisScore: true,
        status: true,
        analyzedAt: true,
        createdAt: true,
      },
    });

    
  
    
    const [
      totalDocuments,
      processedDocuments,
      documentsThisWeek,
      documentsLastWeek,
    ] = await Promise.all([
      prisma.document.count({
        where: {
          userId,
          resume: null, // Exclude resumes
        },
      }),
      prisma.document.count({
        where: {
          userId,
          status: DocumentStatus.READY,
          resume: null,
        },
      }),
      prisma.document.count({
        where: {
          userId,
          createdAt: { gte: startOfWeek },
          resume: null,
        },
      }),
      prisma.document.count({
        where: {
          userId,
          createdAt: { gte: startOfLastWeek, lt: endOfLastWeek },
          resume: null,
        },
      }),
    ]);

    

    
    const [totalSkillMasteryGoals, activeSkillMasteryGoals, completedSkillMasteryGoals] = await Promise.all([
      prisma.skillMasteryGoal.count({ where: { userId } }),
      prisma.skillMasteryGoal.count({ where: { userId, status: "ACTIVE" } }),
      prisma.skillMasteryGoal.count({ where: { userId, status: "COMPLETED" } }),
    ]);

    const skillMasteryGoalsWithProgress = await prisma.skillMasteryGoal.findMany({
      where: { userId },
      select: { progress: true },
    });

    const averageSkillMasteryProgress =
      skillMasteryGoalsWithProgress.length > 0
        ? Math.round(
            (skillMasteryGoalsWithProgress.reduce(
              (sum, goal) => sum + goal.progress,
              0,
            ) /
              skillMasteryGoalsWithProgress.length) *
              100,
          ) / 100
        : 0;


    
    let creditAnalytics;
    try {
      creditAnalytics = await CreditService.getUsageAnalytics(userId);
      
      const subscription = await prisma.userSubscription.findUnique({
        where: { userId },
        select: {
          creditPeriodEnd: true,
          creditPeriodStart: true,
        },
      });

      const now = new Date();
      const daysUntilReset = subscription?.creditPeriodEnd
        ? Math.ceil(
            (subscription.creditPeriodEnd.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      const creditUsageTrend = await prisma.creditTransaction.findMany({
        where: {
          userId,
          type: "USAGE",
          createdAt: {
            gte: subscription?.creditPeriodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          amount: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: { createdAt: "asc" },
      });

      const dailyCreditUsage: { [key: string]: number } = {};
      creditUsageTrend.forEach((tx) => {
        const dateKey = tx.createdAt.toISOString().split("T")[0];
        if (dateKey) {
          if (!dailyCreditUsage[dateKey]) {
            dailyCreditUsage[dateKey] = 0;
          }
          dailyCreditUsage[dateKey] += Math.abs(tx.amount);
        }
      });

      const creditTrend = Object.entries(dailyCreditUsage).map(([date, credits]) => ({
        date,
        credits,
      }));

      creditAnalytics = {
        ...creditAnalytics,
        daysUntilReset,
        usageTrend: creditTrend,
      };
    } catch (error) {
      console.error("Error fetching credit analytics:", error);
      creditAnalytics = null;
    }

    // 8. INTERVIEW PERFORMANCE TREND
    
    const interviewSessionsForTrend = await prisma.interviewSession.findMany({
      where: {
        userId,
        status: "COMPLETED",
        overallScore: { not: null },
        completedAt: { not: null },
      },
      select: {
        overallScore: true,
        completedAt: true,
      },
      orderBy: { completedAt: "asc" },
    });

    const interviewScoreTrend = interviewSessionsForTrend.map((session) => ({
      date: session.completedAt!.toISOString().split("T")[0],
      score: Math.round((session.overallScore || 0) * 100) / 100,
    }));

    // 9. LEARNING ACTIVITY HEATMAP
    
    const getActivityHeatmap = async (days: number) => {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const activities: Array<{ date: Date; type: string }> = [];

      const quizAttempts = await prisma.quizAttempt.findMany({
        where: {
          userId,
          completedAt: { gte: startDate, not: null },
          status: AttemptStatus.COMPLETED,
        },
        select: { completedAt: true },
      });
      quizAttempts.forEach((attempt) => {
        if (attempt.completedAt) activities.push({ date: attempt.completedAt, type: "quiz" });
      });

      const interviewSessions = await prisma.interviewSession.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
        },
        select: { createdAt: true },
      });
      interviewSessions.forEach((session) => {
        activities.push({ date: session.createdAt, type: "interview" });
      });

      const roadmapTasks = await prisma.careerTask.findMany({
        where: {
          goal: { userId },
          completedAt: { gte: startDate, not: null },
          status: "COMPLETED",
        },
        select: { completedAt: true },
      });
      roadmapTasks.forEach((task) => {
        if (task.completedAt) activities.push({ date: task.completedAt, type: "roadmap" });
      });

      const skillMasteryTasks = await prisma.skillMasteryTask.findMany({
        where: {
          goal: { userId },
          completedAt: { gte: startDate, not: null },
          status: "COMPLETED",
        },
        select: { completedAt: true },
      });
      skillMasteryTasks.forEach((task) => {
        if (task.completedAt) activities.push({ date: task.completedAt, type: "skill_mastery" });
      });

      const dailyActivity: { [key: string]: number } = {};
      activities.forEach((activity) => {
        const dateKey = activity.date.toISOString().split("T")[0];
        if (dateKey) {
          if (!dailyActivity[dateKey]) {
            dailyActivity[dateKey] = 0;
          }
          dailyActivity[dateKey] += 1;
        }
      });

      return Object.entries(dailyActivity).map(([date, count]) => ({
        date,
        count,
      }));
    };

    const [activityHeatmap30, activityHeatmap90] = await Promise.all([
      getActivityHeatmap(30),
      getActivityHeatmap(90),
    ]);

    const activityByFeature = {
      career_roadmap: roadmapTasksThisWeek,
      interview_session: interviewSessionsThisWeek,
      quiz: thisWeekAttempts,
      skill_mastery: await prisma.skillMasteryTask.count({
        where: {
          goal: { userId },
          completedAt: { gte: startOfWeek, not: null },
          status: "COMPLETED",
        },
      }),
      resume: resumesThisWeek,
      document: documentsThisWeek,
    };

    // 10. OVERALL SUMMARY
    
    const overallLearningActivity =
      thisWeekAttempts +
      interviewSessionsThisWeek +
      roadmapTasksThisWeek +
      resumesThisWeek +
      documentsThisWeek;

    const lastWeekLearningActivity =
      lastWeekAttempts +
      interviewSessionsLastWeek +
      roadmapTasksLastWeek +
      resumesLastWeek +
      documentsLastWeek;

    const overallPerformanceScore = Math.round(
      (averageRoadmapProgress * 0.3 +
        (interviewScoreStats._avg.overallScore || 0) * 0.3 +
        averageSkillMasteryProgress * 0.2 +
        (resumeScoreStats._avg.analysisScore || 0) * 0.2) /
        1.0,
    );

    return res.json({
      analytics: {
        // Overall Summary
        overview: {
          overallProgress: Math.round(
            (overallProgress + averageRoadmapProgress) / 2,
          ),
          overallPerformanceScore,
          overallLearningActivity: {
            thisWeek: overallLearningActivity,
            lastWeek: lastWeekLearningActivity,
            change: overallLearningActivity - lastWeekLearningActivity,
            streakDays: await (async () => {
              const activities = await prisma.quizAttempt.findMany({
                where: {
                  userId,
                  completedAt: { not: null },
                  status: AttemptStatus.COMPLETED,
                },
                select: { completedAt: true },
                orderBy: { completedAt: "desc" },
                take: 30,
              });
              if (activities.length === 0) return 0;
              let streak = 0;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              for (let i = 0; i < activities.length; i++) {
                const activity = activities[i];
                if (!activity || !activity.completedAt) continue;
                const activityDate = new Date(activity.completedAt);
                activityDate.setHours(0, 0, 0, 0);
                const daysDiff = Math.floor(
                  (today.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24),
                );
                if (daysDiff === i) {
                  streak++;
                } else {
                  break;
                }
              }
              return streak;
            })(),
          },
        },

        quizzes: {
          totalQuizzes,
          totalAttempts,
          totalTopics,
          averageScore: overallProgress,
        },

        interviewPrep: {
          totalSessions: totalInterviewSessions,
          completedSessions: completedInterviewSessions,
          averageScore:
            Math.round((interviewScoreStats._avg.overallScore || 0) * 100) /
            100,
          bestScore: interviewScoreStats._max.overallScore
            ? Math.round(interviewScoreStats._max.overallScore * 100) / 100
            : null,
          sessionsByLevel: interviewSessionsByLevel.map((item) => ({
            level: item.level,
            count: item._count.id,
          })),
          scoreTrend: interviewScoreTrend,
          weeklyComparison: {
            thisWeek: interviewSessionsThisWeek,
            lastWeek: interviewSessionsLastWeek,
            change:
              interviewSessionsThisWeek - interviewSessionsLastWeek,
          },
        },

        careerRoadmaps: {
          totalGoals: totalCareerGoals,
          activeGoals: activeCareerGoals,
          completedGoals: completedCareerGoals,
          averageProgress: averageRoadmapProgress,
          totalTasks: totalRoadmapTasks,
          completedTasks: completedRoadmapTasks,
          milestonesAchieved,
          weeklyComparison: {
            goals: {
              thisWeek: careerGoalsThisWeek,
              lastWeek: careerGoalsLastWeek,
              change: careerGoalsThisWeek - careerGoalsLastWeek,
            },
            tasks: {
              thisWeek: roadmapTasksThisWeek,
              lastWeek: roadmapTasksLastWeek,
              change: roadmapTasksThisWeek - roadmapTasksLastWeek,
            },
          },
        },

        resumes: {
          totalResumes,
          analyzedResumes,
          averageScore:
            Math.round((resumeScoreStats._avg.analysisScore || 0) * 100) / 100,
          bestScore: resumeScoreStats._max.analysisScore
            ? Math.round(resumeScoreStats._max.analysisScore * 100) / 100
            : null,
          weeklyComparison: {
            thisWeek: resumesThisWeek,
            lastWeek: resumesLastWeek,
            change: resumesThisWeek - resumesLastWeek,
          },
        },

        documents: {
          totalDocuments,
          processedDocuments,
          weeklyComparison: {
            thisWeek: documentsThisWeek,
            lastWeek: documentsLastWeek,
            change: documentsThisWeek - documentsLastWeek,
          },
        },

        skillMastery: {
          totalGoals: totalSkillMasteryGoals,
          activeGoals: activeSkillMasteryGoals,
          completedGoals: completedSkillMasteryGoals,
          averageProgress: averageSkillMasteryProgress,
        },

        credits: creditAnalytics,

        learningActivity: {
          heatmap: {
            last30Days: activityHeatmap30,
            last90Days: activityHeatmap90,
          },
          byFeature: activityByFeature,
        },

        // Recent Activity (all features combined)
        recentActivity: {
          quizAttempts: recentAttempts.map(
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
              type: "quiz",
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
          interviewSessions: recentInterviewSessions.map((session) => ({
            id: session.id,
            type: "interview",
            role: session.role,
            level: session.level,
            status: session.status,
            score: session.overallScore,
            completedAt: session.completedAt,
            createdAt: session.createdAt,
          })),
          resumes: recentResumes.map((resume) => ({
            id: resume.id,
            type: "resume",
            title: resume.title || resume.filename,
            filename: resume.filename,
            score: resume.analysisScore,
            status: resume.status,
            analyzedAt: resume.analyzedAt,
            createdAt: resume.createdAt,
          })),
        },
      },
    });
  } catch (error: any) {
    console.error("Get user analytics error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get user analytics", message: error.message });
  }
};
