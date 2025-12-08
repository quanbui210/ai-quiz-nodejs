import { Request, Response } from "express";
import { QuizStatus, QuestionType } from "@prisma/client";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";


export const getQuizTemplate = async (req: Request, res: Response) => {
  try {
    const { skillName, phase } = req.params;
    
    if (!skillName || !phase) {
      return res.status(400).json({
        error: "skillName and phase (number) are required",
      });
    }
    
    const phaseNum = parseInt(phase, 10);

    if (isNaN(phaseNum)) {
      return res.status(400).json({
        error: "phase must be a valid number",
      });
    }

    const skill = await prisma.skill.findUnique({
      where: { name: skillName },
    });

    if (!skill) {
      return res.status(404).json({
        error: "Skill not found",
        message: `No skill found with name: ${skillName}`,
      });
    }

    const template = await prisma.skillMasteryQuizTemplate.findFirst({
      where: {
        OR: [
          { skillId: skill.id, phase: phaseNum },
          { skillName, phase: phaseNum },
        ],
      },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            question: true,
            type: true,
            options: true,
            points: true,
            order: true,
            // Don't send correctAnswer or explanation to client
          },
        },
      },
    });

    if (!template || !template.isActive) {
      return res.status(404).json({
        error: "Quiz template not found",
        message: `No quiz available for ${skillName} Phase ${phaseNum}`,
      });
    }

    // Get skill name for response
    const templateSkillName = template.skill?.name || template.skillName || skillName;

    return res.json({
      id: template.id,
      skillName: templateSkillName,
      phase: template.phase,
      title: template.title,
      description: template.description,
      difficulty: template.difficulty,
      totalQuestions: template.questions.length,
      questions: template.questions,
    });
  } catch (error: any) {
    console.error("Get quiz template error:", error);
    return res.status(500).json({ error: "Failed to get quiz template" });
  }
};


export const createUserQuiz = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;
    const { phase } = req.body;

    if (!goalId) {
      return res.status(400).json({ error: "Goal ID is required" });
    }

    if (!phase || typeof phase !== "number") {
      return res.status(400).json({
        error: "phase is required and must be a number",
      });
    }

    // Verify goal belongs to user
    const goal = await prisma.skillMasteryGoal.findFirst({
      where: {
        id: goalId,
        userId: req.user.id,
      },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Skill mastery goal not found" });
    }

    if (!goal.skillId) {
      return res.status(500).json({ error: "Goal missing skill reference" });
    }

    // Get quiz template - try skillId first, fallback to skillName during migration
    const template = await prisma.skillMasteryQuizTemplate.findFirst({
      where: {
        OR: [
          { skillId: goal.skillId, phase: phase },
          ...(goal.skillName ? [{ skillName: goal.skillName, phase: phase }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        isActive: true,
        questions: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!template || !template.isActive) {
      return res.status(404).json({
        error: "Quiz template not found",
        message: `No quiz available for ${goal.skillName} Phase ${phase}`,
      });
    }

    // Check if user already has a quiz for this phase
    const existingQuiz = await prisma.skillMasteryQuiz.findFirst({
      where: {
        goalId,
        phase,
        userId: req.user.id,
      },
    });

    if (existingQuiz) {
      // Return existing quiz
      const quiz = await prisma.skillMasteryQuiz.findUnique({
        where: { id: existingQuiz.id },
        include: {
          template: {
            include: {
              questions: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  question: true,
                  type: true,
                  options: true,
                  points: true,
                  order: true,
                },
              },
            },
          },
          attempts: {
            orderBy: { completedAt: "desc" },
            take: 1,
          },
        },
      });

      return res.json({
        id: quiz!.id,
        goalId: quiz!.goalId,
        templateId: quiz!.templateId,
        title: quiz!.title,
        phase: quiz!.phase,
        status: quiz!.status,
        score: quiz!.score,
        totalQuestions: quiz!.totalQuestions,
        correctAnswers: quiz!.correctAnswers,
        startedAt: quiz!.startedAt,
        completedAt: quiz!.completedAt,
        questions: quiz!.template.questions,
        lastAttempt: quiz!.attempts[0] || null,
      });
    }

    // Create new quiz instance
    const quiz = await prisma.skillMasteryQuiz.create({
      data: {
        userId: req.user.id,
        goalId,
        templateId: template.id,
        title: template.title,
        phase,
        status: QuizStatus.PENDING,
        totalQuestions: template.questions.length,
      },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                question: true,
                type: true,
                options: true,
                points: true,
                order: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      id: quiz.id,
      goalId: quiz.goalId,
      templateId: quiz.templateId,
      title: quiz.title,
      phase: quiz.phase,
      status: quiz.status,
      totalQuestions: quiz.totalQuestions,
      questions: quiz.template.questions,
    });
  } catch (error: any) {
    console.error("Create user quiz error:", error);
    return res.status(500).json({ error: "Failed to create quiz" });
  }
};

/**
 * Start a quiz (mark as active)
 * POST /api/v1/skill-mastery/quizzes/:quizId/start
 */
export const startQuiz = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { quizId } = req.params;

    const quiz = await prisma.skillMasteryQuiz.findFirst({
      where: {
        id: quizId,
        userId: req.user.id,
      },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                question: true,
                type: true,
                options: true,
                points: true,
                order: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.status === QuizStatus.COMPLETED) {
      return res.status(400).json({
        error: "Quiz already completed",
        message: "You cannot restart a completed quiz. Create a new quiz to retake.",
      });
    }

    // Update status to ACTIVE and set startedAt
    const updatedQuiz = await prisma.skillMasteryQuiz.update({
      where: { id: quizId },
      data: {
        status: QuizStatus.ACTIVE,
        startedAt: quiz.startedAt || new Date(),
      },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                question: true,
                type: true,
                options: true,
                points: true,
                order: true,
              },
            },
          },
        },
      },
    });

    return res.json({
      id: updatedQuiz.id,
      status: updatedQuiz.status,
      startedAt: updatedQuiz.startedAt,
      totalQuestions: updatedQuiz.totalQuestions,
      questions: updatedQuiz.template.questions,
    });
  } catch (error: any) {
    console.error("Start quiz error:", error);
    return res.status(500).json({ error: "Failed to start quiz" });
  }
};

/**
 * Submit quiz answers and get results
 * POST /api/v1/skill-mastery/quizzes/:quizId/submit
 */
export const submitQuizAnswers = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { quizId } = req.params;
    const { answers } = req.body;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({
        error: "answers object is required",
        message: "Format: { questionId: answer }",
      });
    }

    // Get quiz with template and questions
    const quiz = await prisma.skillMasteryQuiz.findFirst({
      where: {
        id: quizId,
        userId: req.user.id,
      },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.status === QuizStatus.COMPLETED) {
      return res.status(400).json({
        error: "Quiz already completed",
        message: "This quiz has already been submitted.",
      });
    }

    // Validate all questions are answered
    const templateQuestions = quiz.template.questions;
    const answeredQuestionIds = Object.keys(answers);
    
    if (answeredQuestionIds.length !== templateQuestions.length) {
      return res.status(400).json({
        error: "Incomplete answers",
        message: `Expected ${templateQuestions.length} answers, got ${answeredQuestionIds.length}`,
      });
    }

    // Score the quiz
    const results: Array<{
      questionId: string;
      question: string;
      userAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      explanation: string | null;
      points: number;
    }> = [];

    let correctCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;

    for (const question of templateQuestions) {
      const userAnswer = answers[question.id];
      if (!userAnswer) {
        continue; // Skip if not answered
      }

      totalPoints += question.points;

      let isCorrect = false;
      const userAnswerNormalized = String(userAnswer).toLowerCase().trim();
      const correctAnswerNormalized = String(question.correctAnswer).toLowerCase().trim();

      // Handle different question types
      if (question.type === QuestionType.MULTIPLE_CHOICE) {
        // For multiple choice, compare with correct answer text
        isCorrect = userAnswerNormalized === correctAnswerNormalized;
      } else if (question.type === QuestionType.TRUE_FALSE) {
        // For true/false, compare boolean values
        isCorrect = userAnswerNormalized === correctAnswerNormalized;
      } else {
        // For short answer, do fuzzy matching (contains or exact match)
        isCorrect =
          userAnswerNormalized === correctAnswerNormalized ||
          correctAnswerNormalized.includes(userAnswerNormalized) ||
          userAnswerNormalized.includes(correctAnswerNormalized);
      }

      if (isCorrect) {
        correctCount++;
        earnedPoints += question.points;
      }

      results.push({
        questionId: question.id,
        question: question.question,
        userAnswer: String(userAnswer),
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
        points: isCorrect ? question.points : 0,
      });
    }

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

    // Create attempt record
    const attempt = await prisma.skillMasteryQuizAttempt.create({
      data: {
        quizId: quiz.id,
        answers: answers as any,
        score: Math.round(score * 100) / 100,
        correctCount,
        totalQuestions: templateQuestions.length,
      },
    });

    // Update quiz status
    const updatedQuiz = await prisma.skillMasteryQuiz.update({
      where: { id: quizId },
      data: {
        status: QuizStatus.COMPLETED,
        score: Math.round(score * 100) / 100,
        correctAnswers: correctCount,
        completedAt: new Date(),
      },
    });

    return res.json({
      id: updatedQuiz.id,
      status: updatedQuiz.status,
      score: updatedQuiz.score,
      correctAnswers: updatedQuiz.correctAnswers,
      totalQuestions: updatedQuiz.totalQuestions,
      completedAt: updatedQuiz.completedAt,
      results,
      attemptId: attempt.id,
    });
  } catch (error: any) {
    console.error("Submit quiz answers error:", error);
    return res.status(500).json({ error: "Failed to submit quiz answers" });
  }
};

/**
 * Get quiz results
 * GET /api/v1/skill-mastery/quizzes/:quizId/results
 */
export const getQuizResults = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { quizId } = req.params;

    const quiz = await prisma.skillMasteryQuiz.findFirst({
      where: {
        id: quizId,
        userId: req.user.id,
      },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
        attempts: {
          orderBy: { completedAt: "desc" },
        },
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.status !== QuizStatus.COMPLETED) {
      return res.status(400).json({
        error: "Quiz not completed",
        message: "Quiz must be completed to view results",
      });
    }

    // Get the latest attempt
    const latestAttempt = quiz.attempts[0];
    if (!latestAttempt) {
      return res.status(404).json({
        error: "No attempt found",
        message: "Quiz has no completed attempts",
      });
    }

    // Reconstruct results from attempt answers
    const results: Array<{
      questionId: string;
      question: string;
      userAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      explanation: string | null;
      points: number;
    }> = [];

    const attemptAnswers = latestAttempt.answers as any;

    for (const question of quiz.template.questions) {
      const userAnswer = attemptAnswers[question.id] || "";
      
      let isCorrect = false;
      const userAnswerNormalized = String(userAnswer).toLowerCase().trim();
      const correctAnswerNormalized = String(question.correctAnswer).toLowerCase().trim();

      if (question.type === QuestionType.MULTIPLE_CHOICE) {
        isCorrect = userAnswerNormalized === correctAnswerNormalized;
      } else if (question.type === QuestionType.TRUE_FALSE) {
        isCorrect = userAnswerNormalized === correctAnswerNormalized;
      } else {
        isCorrect =
          userAnswerNormalized === correctAnswerNormalized ||
          correctAnswerNormalized.includes(userAnswerNormalized) ||
          userAnswerNormalized.includes(correctAnswerNormalized);
      }

      results.push({
        questionId: question.id,
        question: question.question,
        userAnswer: String(userAnswer),
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
        points: isCorrect ? question.points : 0,
      });
    }

    return res.json({
      id: quiz.id,
      title: quiz.title,
      phase: quiz.phase,
      score: quiz.score,
      correctAnswers: quiz.correctAnswers,
      totalQuestions: quiz.totalQuestions,
      completedAt: quiz.completedAt,
      attempts: quiz.attempts.map((a) => ({
        id: a.id,
        score: a.score,
        correctCount: a.correctCount,
        totalQuestions: a.totalQuestions,
        completedAt: a.completedAt,
      })),
      results,
    });
  } catch (error: any) {
    console.error("Get quiz results error:", error);
    return res.status(500).json({ error: "Failed to get quiz results" });
  }
};

/**
 * Get all quizzes for a skill mastery goal
 * GET /api/v1/skill-mastery/goals/:goalId/quizzes
 */
export const getGoalQuizzes = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;

    // Verify goal belongs to user
    const goal = await prisma.skillMasteryGoal.findFirst({
      where: {
        id: goalId,
        userId: req.user.id,
      },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Skill mastery goal not found" });
    }

    if (!goal.skillId) {
      return res.status(500).json({ error: "Goal missing skill reference" });
    }

    // Get user's quiz instances
    const userQuizzes = await prisma.skillMasteryQuiz.findMany({
      where: {
        goalId,
        userId: req.user.id,
      },
      include: {
        attempts: {
          orderBy: { completedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { phase: "asc" },
    });

    // Get available quiz templates for this skill
    // Try skillId first, fallback to skillName during migration
    const availableTemplates = await prisma.skillMasteryQuizTemplate.findMany({
      where: {
        OR: [
          { skillId: goal.skillId, isActive: true },
          ...(goal.skillName ? [{ skillName: goal.skillName, isActive: true }] : []),
        ],
      },
      include: {
        questions: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { phase: "asc" },
    });

    // Debug logging
    const skillName = goal.skill?.name || goal.skillName || "Unknown";
    console.log(`[getGoalQuizzes] Goal skillName: "${skillName}"`);
    console.log(`[getGoalQuizzes] Found ${availableTemplates.length} quiz templates`);

    // Create a map of phase -> user quiz instance
    const userQuizzesByPhase = new Map(
      userQuizzes.map((q) => [q.phase, q]),
    );

    // Combine templates with user quiz instances
    const quizzes = availableTemplates.map((template) => {
      const userQuiz = userQuizzesByPhase.get(template.phase);
      return {
        phase: template.phase,
        title: template.title,
        description: template.description,
        difficulty: template.difficulty,
        totalQuestions: template.questions.length,
        // User quiz instance (if exists)
        userQuiz: userQuiz
          ? {
              id: userQuiz.id,
              status: userQuiz.status,
              score: userQuiz.score,
              correctAnswers: userQuiz.correctAnswers,
              startedAt: userQuiz.startedAt,
              completedAt: userQuiz.completedAt,
              lastAttempt: userQuiz.attempts[0] || null,
            }
          : null,
        // Indicates if quiz template is available
        isAvailable: true,
      };
    });

    // Always return quizzes array, even if empty
    return res.json({
      goalId,
      skillName: skillName,
      quizzes: quizzes.length > 0 ? quizzes : [], // Explicitly return empty array if no templates found
      totalAvailable: availableTemplates.length,
    });
  } catch (error: any) {
    console.error("Get goal quizzes error:", error);
    return res.status(500).json({ error: "Failed to get goal quizzes" });
  }
};

