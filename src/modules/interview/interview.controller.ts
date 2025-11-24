import { Response } from "express";
import {
  InterviewLevel,
  InterviewStatus,
  QuestionCategory,
  Prisma,
} from "@prisma/client";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import {
  evaluateInterviewAnswer,
  generateInterviewQuestion,
  summarizeInterviewSession,
} from "./interview.service";

const DEFAULT_TOTAL_QUESTIONS = 8;

const isEnumValue = <T extends Record<string, string>>(
  enumeration: T,
  value: string,
): value is T[keyof T] => (Object.values(enumeration) as string[]).includes(value);

const isValidLevel = (level: string): level is InterviewLevel =>
  isEnumValue(InterviewLevel, level);

const isValidCategory = (value: string): value is QuestionCategory =>
  isEnumValue(QuestionCategory, value);

const extractResumeHighlights = (resumeText?: string | null): string[] => {
  if (!resumeText) {
    return [];
  }
  return resumeText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);
};

export const createInterviewSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      role,
      roleDescription,
      level,
      yearsOfExperience,
      country,
      industry,
      resumeId,
      questionCount,
    } = req.body;

    if (!role || typeof role !== "string") {
      return res.status(400).json({ error: "Role is required" });
    }

    if (!level || typeof level !== "string" || !isValidLevel(level)) {
      return res.status(400).json({ error: "Invalid interview level" });
    }

    const parsedQuestionCount =
      typeof questionCount === "number" && questionCount > 0
        ? Math.min(questionCount, 20)
        : DEFAULT_TOTAL_QUESTIONS;

    let resume: { id: string; parsedText: string | null } | null = null;
    if (resumeId) {
      resume = await prisma.resume.findFirst({
        where: { id: resumeId, userId: req.user.id },
        select: { id: true, parsedText: true },
      });
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }
    }

    const session = await prisma.interviewSession.create({
      data: {
        userId: req.user.id,
        role: role.trim(),
        roleDescription: roleDescription
          ? String(roleDescription).trim()
          : null,
        level,
        yearsOfExperience:
          yearsOfExperience !== undefined && yearsOfExperience !== null
            ? Number(yearsOfExperience)
            : null,
        country: country ? String(country).trim() : null,
        industry: industry ? String(industry).trim() : null,
        resumeId: resume?.id,
        totalQuestions: parsedQuestionCount,
      },
    });

    const generatedQuestion = await generateInterviewQuestion({
      role: session.role,
      roleDescription: session.roleDescription,
      level: session.level,
      yearsOfExperience: session.yearsOfExperience,
      country: session.country,
      industry: session.industry,
      previousQuestions: [],
      resumeHighlights: extractResumeHighlights(resume?.parsedText),
    });

    const questionRecord = await prisma.interviewQuestion.create({
      data: {
        sessionId: session.id,
        question: generatedQuestion.question,
        type: generatedQuestion.category,
        order: 1,
        aiFeedback: generatedQuestion.rationale
          ? { rationale: generatedQuestion.rationale }
          : undefined,
      },
    });

    // Increment monthly interview session count
    const { incrementInterviewSessionCount } = await import("../../utils/usage");
    await incrementInterviewSessionCount(req.user.id);

    return res.status(201).json({
      message: "Interview session created",
      session,
      firstQuestion: questionRecord,
    });
  } catch (error: any) {
    console.error("Create interview session error:", error);
    return res
      .status(500)
      .json({ error: "Failed to create interview session" });
  }
};

export const listInterviewSessions = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status } = req.query;

    const statusFilter =
      typeof status === "string" && isEnumValue(InterviewStatus, status)
        ? (status as InterviewStatus)
        : undefined;

    const sessions = await prisma.interviewSession.findMany({
      where: {
        userId: req.user.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        role: true,
        level: true,
        status: true,
        overallScore: true,
        totalQuestions: true,
        answeredCount: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return res.json({ sessions });
  } catch (error: any) {
    console.error("List interview sessions error:", error);
    return res.status(500).json({ error: "Failed to list interview sessions" });
  }
};

export const getInterviewSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;

    const session = await prisma.interviewSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: {
            answers: {
              orderBy: { answeredAt: "desc" },
            },
          },
        },
        notes: {
          orderBy: { updatedAt: "desc" },
        },
        resume: {
          select: { id: true, title: true, filename: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Interview session not found" });
    }

    return res.json({ session });
  } catch (error: any) {
    console.error("Get interview session error:", error);
    return res.status(500).json({ error: "Failed to retrieve interview session" });
  }
};

export const generateNextInterviewQuestion = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    const { preferredCategory } = req.body;

    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId: req.user.id },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
        resume: {
          select: { parsedText: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Interview session not found" });
    }

    if (session.status === InterviewStatus.COMPLETED) {
      return res.status(400).json({
        error: "Session already completed",
      });
    }

    if (session.questions.length >= session.totalQuestions) {
      return res.status(400).json({
        error: "Maximum question count reached for this session",
      });
    }

    const generatedQuestion = await generateInterviewQuestion({
      role: session.role,
      roleDescription: session.roleDescription,
      level: session.level,
      yearsOfExperience: session.yearsOfExperience,
      country: session.country,
      industry: session.industry,
      previousQuestions: session.questions.map((q) => q.question),
      preferredCategory:
        preferredCategory && isValidCategory(preferredCategory)
          ? (preferredCategory as QuestionCategory)
          : undefined,
      resumeHighlights: extractResumeHighlights(session.resume?.parsedText),
    });

    const questionRecord = await prisma.interviewQuestion.create({
      data: {
        sessionId: session.id,
        question: generatedQuestion.question,
        type: generatedQuestion.category,
        order: session.questions.length + 1,
        aiFeedback: generatedQuestion.rationale
          ? { rationale: generatedQuestion.rationale }
          : undefined,
      },
    });

    return res.json({
      question: questionRecord,
    });
  } catch (error: any) {
    console.error("Generate next interview question error:", error);
    return res
      .status(500)
      .json({ error: "Failed to generate interview question" });
  }
};

export const submitInterviewAnswer = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId, questionId } = req.params;
    const { answer } = req.body;

    if (!answer || typeof answer !== "string" || answer.trim().length < 20) {
      return res.status(400).json({
        error:
          "Answer is required and should include at least 20 characters for meaningful feedback",
      });
    }

    const question = await prisma.interviewQuestion.findFirst({
      where: {
        id: questionId,
        sessionId,
        session: {
          userId: req.user.id,
        },
      },
      include: {
        session: {
          include: {
            resume: {
              select: { parsedText: true },
            },
          },
        },
        answers: {
          orderBy: { answeredAt: "desc" },
          take: 1,
        },
      },
    });

    if (!question) {
      return res.status(404).json({ error: "Interview question not found" });
    }

    let answerRecord;
    const existingAnswer = question.answers[0];
    if (existingAnswer) {
      answerRecord = await prisma.interviewAnswer.update({
        where: { id: existingAnswer.id },
        data: {
          userAnswer: answer.trim(),
          answeredAt: new Date(),
        },
      });
    } else {
      answerRecord = await prisma.interviewAnswer.create({
        data: {
          questionId: question.id,
          userAnswer: answer.trim(),
        },
      });

      await prisma.interviewSession.update({
        where: { id: question.sessionId },
        data: {
          answeredCount: {
            increment: 1,
          },
        },
      });
    }

    const evaluation = await evaluateInterviewAnswer({
      role: question.session.role,
      level: question.session.level,
      question: question.question,
      category: question.type,
      answer: answer.trim(),
      resumeHighlights: extractResumeHighlights(
        question.session.resume?.parsedText,
      ),
    });

    await prisma.interviewAnswer.update({
      where: { id: answerRecord.id },
      data: {
        aiScore: evaluation.score,
        improvementTips: evaluation.improvementTips,
        exampleAnswer: evaluation.exampleAnswer || null,
        starFormatScore: evaluation.starFormatScore || undefined,
      } as any, // Type assertion needed until Prisma Client is fully regenerated
    });

    await prisma.interviewQuestion.update({
      where: { id: question.id },
      data: {
        aiFeedback: {
          strengths: evaluation.strengths,
          weaknesses: evaluation.weaknesses,
          suggestions: evaluation.suggestions,
        },
      },
    });

    const latestSession = await prisma.interviewSession.findUnique({
      where: { id: question.sessionId },
      include: {
        questions: {
          include: {
            answers: true,
          },
        },
      },
    });

    if (latestSession) {
      const scoredAnswers = latestSession.questions
        .flatMap((q) => q.answers)
        .filter((ans) => ans.aiScore !== null && ans.aiScore !== undefined);

      const averageScore =
        scoredAnswers.length > 0
          ? scoredAnswers.reduce((sum, current) => sum + (current.aiScore || 0), 0) /
            scoredAnswers.length
          : null;

      const strengths = new Set<string>();
      const weaknesses = new Set<string>();

      latestSession.questions.forEach((q) => {
        const feedback = q.aiFeedback as
          | {
              strengths?: string[];
              weaknesses?: string[];
            }
          | undefined;
        feedback?.strengths?.forEach((item) => strengths.add(item));
        feedback?.weaknesses?.forEach((item) => weaknesses.add(item));
      });

      await prisma.interviewSession.update({
        where: { id: latestSession.id },
        data: {
          overallScore: averageScore,
          strengths: Array.from(strengths),
          weaknesses: Array.from(weaknesses),
        },
      });
    }

    return res.json({
      message: "Answer evaluated successfully",
      evaluation,
    });
  } catch (error: any) {
    console.error("Submit interview answer error:", error);
    return res.status(500).json({ error: "Failed to evaluate the answer" });
  }
};

export const completeInterviewSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;

    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId: req.user.id },
      include: {
        questions: {
          include: {
            answers: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Interview session not found" });
    }

    if (session.status === InterviewStatus.COMPLETED) {
      return res.status(400).json({ error: "Session already completed" });
    }

    const answered = session.questions.flatMap((q) => q.answers);
    if (answered.length === 0) {
      return res
        .status(400)
        .json({ error: "Answer at least one question before completing" });
    }

    const summary = await summarizeInterviewSession({
      role: session.role,
      level: session.level,
      answers: session.questions.map((q) => ({
        question: q.question,
        answer: q.answers[0]?.userAnswer || "",
        score: q.answers[0]?.aiScore,
        strengths: ((q.aiFeedback as any)?.strengths || []) as string[],
        weaknesses: ((q.aiFeedback as any)?.weaknesses || []) as string[],
      })),
    });

    // Ensure recommendations is an array
    const recommendationsArray = Array.isArray(summary.recommendations)
      ? summary.recommendations
      : [];

    console.log("Session summary generated:", {
      overallScore: summary.overallScore,
      strengthsCount: summary.strengths.length,
      weaknessesCount: summary.weaknesses.length,
      recommendationsCount: recommendationsArray.length,
      recommendations: recommendationsArray,
    });

    const updateData: any = {
      status: InterviewStatus.COMPLETED,
      completedAt: new Date(),
      overallScore: summary.overallScore,
      strengths: summary.strengths,
      weaknesses: summary.weaknesses,
    };

    // Only set recommendations if we have them
    if (recommendationsArray.length > 0) {
      updateData.recommendations = recommendationsArray as Prisma.InputJsonValue;
    }

    const updatedSession = await prisma.interviewSession.update({
      where: { id: session.id },
      data: updateData,
    });

    return res.json({
      message: "Interview session completed",
      session: updatedSession,
      summary,
    });
  } catch (error: any) {
    console.error("Complete interview session error:", error);
    return res.status(500).json({ error: "Failed to complete interview session" });
  }
};

export const addInterviewNote = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Note content is required" });
    }

    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId: req.user.id },
    });

    if (!session) {
      return res.status(404).json({ error: "Interview session not found" });
    }

    const note = await prisma.interviewNote.create({
      data: {
        sessionId: session.id,
        content: content.trim(),
      },
    });

    return res.status(201).json({ note });
  } catch (error: any) {
    console.error("Add interview note error:", error);
    return res.status(500).json({ error: "Failed to create interview note" });
  }
};

export const updateInterviewNote = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId, noteId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Note content is required" });
    }

    const note = await prisma.interviewNote.findFirst({
      where: {
        id: noteId,
        sessionId,
        session: {
          userId: req.user.id,
        },
      },
    });

    if (!note) {
      return res.status(404).json({ error: "Interview note not found" });
    }

    const updatedNote = await prisma.interviewNote.update({
      where: { id: note.id },
      data: {
        content: content.trim(),
      },
    });

    return res.json({ note: updatedNote });
  } catch (error: any) {
    console.error("Update interview note error:", error);
    return res.status(500).json({ error: "Failed to update interview note" });
  }
};

export const deleteInterviewNote = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId, noteId } = req.params;

    const note = await prisma.interviewNote.findFirst({
      where: {
        id: noteId,
        sessionId,
        session: {
          userId: req.user.id,
        },
      },
    });

    if (!note) {
      return res.status(404).json({ error: "Interview note not found" });
    }

    await prisma.interviewNote.delete({
      where: { id: note.id },
    });

    return res.json({ message: "Interview note deleted" });
  } catch (error: any) {
    console.error("Delete interview note error:", error);
    return res.status(500).json({ error: "Failed to delete interview note" });
  }
};

export const deleteInterviewSession = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;

    const session = await prisma.interviewSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
      include: {
        questions: {
          include: {
            answers: {
              select: { id: true },
            },
          },
        },
        notes: {
          select: { id: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Interview session not found" });
    }

    // Delete all related data in a transaction
    await prisma.$transaction([
      // Delete answers (from questions)
      prisma.interviewAnswer.deleteMany({
        where: {
          questionId: {
            in: session.questions.map((q) => q.id),
          },
        },
      }),
      // Delete questions
      prisma.interviewQuestion.deleteMany({
        where: { sessionId: session.id },
      }),
      // Delete notes
      prisma.interviewNote.deleteMany({
        where: { sessionId: session.id },
      }),
      // Delete the session
      prisma.interviewSession.delete({
        where: { id: session.id },
      }),
    ]);

    return res.json({
      message: "Interview session deleted successfully",
      deletedSessionId: session.id,
      deletedRole: session.role,
      deletedQuestionsCount: session.questions.length,
      deletedNotesCount: session.notes.length,
    });
  } catch (error: any) {
    console.error("Delete interview session error:", error);
    return res.status(500).json({ error: "Failed to delete interview session" });
  }
};

