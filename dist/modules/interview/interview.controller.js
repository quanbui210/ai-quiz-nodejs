"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteInterviewSession = exports.deleteInterviewNote = exports.updateInterviewNote = exports.addInterviewNote = exports.completeInterviewSession = exports.submitInterviewAnswer = exports.generateNextInterviewQuestion = exports.getInterviewSession = exports.listInterviewSessions = exports.createInterviewSession = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const interview_service_1 = require("./interview.service");
const DEFAULT_TOTAL_QUESTIONS = 8;
const isEnumValue = (enumeration, value) => Object.values(enumeration).includes(value);
const isValidLevel = (level) => isEnumValue(client_1.InterviewLevel, level);
const isValidCategory = (value) => isEnumValue(client_1.QuestionCategory, value);
const extractResumeHighlights = (resumeText) => {
    if (!resumeText) {
        return [];
    }
    return resumeText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 8);
};
const createInterviewSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { role, roleDescription, level, yearsOfExperience, country, industry, resumeId, questionCount, } = req.body;
        if (!role || typeof role !== "string") {
            return res.status(400).json({ error: "Role is required" });
        }
        if (!level || typeof level !== "string" || !isValidLevel(level)) {
            return res.status(400).json({ error: "Invalid interview level" });
        }
        const parsedQuestionCount = typeof questionCount === "number" && questionCount > 0
            ? Math.min(questionCount, 20)
            : DEFAULT_TOTAL_QUESTIONS;
        let resume = null;
        if (resumeId) {
            resume = await prisma_1.default.resume.findFirst({
                where: { id: resumeId, userId: req.user.id },
                select: { id: true, parsedText: true },
            });
            if (!resume) {
                return res.status(404).json({ error: "Resume not found" });
            }
        }
        const session = await prisma_1.default.interviewSession.create({
            data: {
                userId: req.user.id,
                role: role.trim(),
                roleDescription: roleDescription
                    ? String(roleDescription).trim()
                    : null,
                level,
                yearsOfExperience: yearsOfExperience !== undefined && yearsOfExperience !== null
                    ? Number(yearsOfExperience)
                    : null,
                country: country ? String(country).trim() : null,
                industry: industry ? String(industry).trim() : null,
                resumeId: resume?.id,
                totalQuestions: parsedQuestionCount,
            },
        });
        const generatedQuestion = await (0, interview_service_1.generateInterviewQuestion)({
            role: session.role,
            roleDescription: session.roleDescription,
            level: session.level,
            yearsOfExperience: session.yearsOfExperience,
            country: session.country,
            industry: session.industry,
            previousQuestions: [],
            resumeHighlights: extractResumeHighlights(resume?.parsedText),
        });
        const questionRecord = await prisma_1.default.interviewQuestion.create({
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
        return res.status(201).json({
            message: "Interview session created",
            session,
            firstQuestion: questionRecord,
        });
    }
    catch (error) {
        console.error("Create interview session error:", error);
        return res
            .status(500)
            .json({ error: "Failed to create interview session" });
    }
};
exports.createInterviewSession = createInterviewSession;
const listInterviewSessions = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { status } = req.query;
        const statusFilter = typeof status === "string" && isEnumValue(client_1.InterviewStatus, status)
            ? status
            : undefined;
        const sessions = await prisma_1.default.interviewSession.findMany({
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
    }
    catch (error) {
        console.error("List interview sessions error:", error);
        return res.status(500).json({ error: "Failed to list interview sessions" });
    }
};
exports.listInterviewSessions = listInterviewSessions;
const getInterviewSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const session = await prisma_1.default.interviewSession.findFirst({
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
    }
    catch (error) {
        console.error("Get interview session error:", error);
        return res.status(500).json({ error: "Failed to retrieve interview session" });
    }
};
exports.getInterviewSession = getInterviewSession;
const generateNextInterviewQuestion = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const { preferredCategory } = req.body;
        const session = await prisma_1.default.interviewSession.findFirst({
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
        if (session.status === client_1.InterviewStatus.COMPLETED) {
            return res.status(400).json({
                error: "Session already completed",
            });
        }
        if (session.questions.length >= session.totalQuestions) {
            return res.status(400).json({
                error: "Maximum question count reached for this session",
            });
        }
        const generatedQuestion = await (0, interview_service_1.generateInterviewQuestion)({
            role: session.role,
            roleDescription: session.roleDescription,
            level: session.level,
            yearsOfExperience: session.yearsOfExperience,
            country: session.country,
            industry: session.industry,
            previousQuestions: session.questions.map((q) => q.question),
            preferredCategory: preferredCategory && isValidCategory(preferredCategory)
                ? preferredCategory
                : undefined,
            resumeHighlights: extractResumeHighlights(session.resume?.parsedText),
        });
        const questionRecord = await prisma_1.default.interviewQuestion.create({
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
    }
    catch (error) {
        console.error("Generate next interview question error:", error);
        return res
            .status(500)
            .json({ error: "Failed to generate interview question" });
    }
};
exports.generateNextInterviewQuestion = generateNextInterviewQuestion;
const submitInterviewAnswer = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId, questionId } = req.params;
        const { answer } = req.body;
        if (!answer || typeof answer !== "string" || answer.trim().length < 20) {
            return res.status(400).json({
                error: "Answer is required and should include at least 20 characters for meaningful feedback",
            });
        }
        const question = await prisma_1.default.interviewQuestion.findFirst({
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
            answerRecord = await prisma_1.default.interviewAnswer.update({
                where: { id: existingAnswer.id },
                data: {
                    userAnswer: answer.trim(),
                    answeredAt: new Date(),
                },
            });
        }
        else {
            answerRecord = await prisma_1.default.interviewAnswer.create({
                data: {
                    questionId: question.id,
                    userAnswer: answer.trim(),
                },
            });
            await prisma_1.default.interviewSession.update({
                where: { id: question.sessionId },
                data: {
                    answeredCount: {
                        increment: 1,
                    },
                },
            });
        }
        const evaluation = await (0, interview_service_1.evaluateInterviewAnswer)({
            role: question.session.role,
            level: question.session.level,
            question: question.question,
            category: question.type,
            answer: answer.trim(),
            resumeHighlights: extractResumeHighlights(question.session.resume?.parsedText),
        });
        await prisma_1.default.interviewAnswer.update({
            where: { id: answerRecord.id },
            data: {
                aiScore: evaluation.score,
                improvementTips: evaluation.improvementTips,
                starFormatScore: evaluation.starFormatScore || undefined,
            },
        });
        await prisma_1.default.interviewQuestion.update({
            where: { id: question.id },
            data: {
                aiFeedback: {
                    strengths: evaluation.strengths,
                    weaknesses: evaluation.weaknesses,
                    suggestions: evaluation.suggestions,
                },
            },
        });
        const latestSession = await prisma_1.default.interviewSession.findUnique({
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
            const averageScore = scoredAnswers.length > 0
                ? scoredAnswers.reduce((sum, current) => sum + (current.aiScore || 0), 0) /
                    scoredAnswers.length
                : null;
            const strengths = new Set();
            const weaknesses = new Set();
            latestSession.questions.forEach((q) => {
                const feedback = q.aiFeedback;
                feedback?.strengths?.forEach((item) => strengths.add(item));
                feedback?.weaknesses?.forEach((item) => weaknesses.add(item));
            });
            await prisma_1.default.interviewSession.update({
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
    }
    catch (error) {
        console.error("Submit interview answer error:", error);
        return res.status(500).json({ error: "Failed to evaluate the answer" });
    }
};
exports.submitInterviewAnswer = submitInterviewAnswer;
const completeInterviewSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const session = await prisma_1.default.interviewSession.findFirst({
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
        if (session.status === client_1.InterviewStatus.COMPLETED) {
            return res.status(400).json({ error: "Session already completed" });
        }
        const answered = session.questions.flatMap((q) => q.answers);
        if (answered.length === 0) {
            return res
                .status(400)
                .json({ error: "Answer at least one question before completing" });
        }
        const summary = await (0, interview_service_1.summarizeInterviewSession)({
            role: session.role,
            level: session.level,
            answers: session.questions.map((q) => ({
                question: q.question,
                answer: q.answers[0]?.userAnswer || "",
                score: q.answers[0]?.aiScore,
                strengths: (q.aiFeedback?.strengths || []),
                weaknesses: (q.aiFeedback?.weaknesses || []),
            })),
        });
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
        const updateData = {
            status: client_1.InterviewStatus.COMPLETED,
            completedAt: new Date(),
            overallScore: summary.overallScore,
            strengths: summary.strengths,
            weaknesses: summary.weaknesses,
        };
        if (recommendationsArray.length > 0) {
            updateData.recommendations = recommendationsArray;
        }
        const updatedSession = await prisma_1.default.interviewSession.update({
            where: { id: session.id },
            data: updateData,
        });
        return res.json({
            message: "Interview session completed",
            session: updatedSession,
            summary,
        });
    }
    catch (error) {
        console.error("Complete interview session error:", error);
        return res.status(500).json({ error: "Failed to complete interview session" });
    }
};
exports.completeInterviewSession = completeInterviewSession;
const addInterviewNote = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const { content } = req.body;
        if (!content || typeof content !== "string") {
            return res.status(400).json({ error: "Note content is required" });
        }
        const session = await prisma_1.default.interviewSession.findFirst({
            where: { id: sessionId, userId: req.user.id },
        });
        if (!session) {
            return res.status(404).json({ error: "Interview session not found" });
        }
        const note = await prisma_1.default.interviewNote.create({
            data: {
                sessionId: session.id,
                content: content.trim(),
            },
        });
        return res.status(201).json({ note });
    }
    catch (error) {
        console.error("Add interview note error:", error);
        return res.status(500).json({ error: "Failed to create interview note" });
    }
};
exports.addInterviewNote = addInterviewNote;
const updateInterviewNote = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId, noteId } = req.params;
        const { content } = req.body;
        if (!content || typeof content !== "string") {
            return res.status(400).json({ error: "Note content is required" });
        }
        const note = await prisma_1.default.interviewNote.findFirst({
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
        const updatedNote = await prisma_1.default.interviewNote.update({
            where: { id: note.id },
            data: {
                content: content.trim(),
            },
        });
        return res.json({ note: updatedNote });
    }
    catch (error) {
        console.error("Update interview note error:", error);
        return res.status(500).json({ error: "Failed to update interview note" });
    }
};
exports.updateInterviewNote = updateInterviewNote;
const deleteInterviewNote = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId, noteId } = req.params;
        const note = await prisma_1.default.interviewNote.findFirst({
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
        await prisma_1.default.interviewNote.delete({
            where: { id: note.id },
        });
        return res.json({ message: "Interview note deleted" });
    }
    catch (error) {
        console.error("Delete interview note error:", error);
        return res.status(500).json({ error: "Failed to delete interview note" });
    }
};
exports.deleteInterviewNote = deleteInterviewNote;
const deleteInterviewSession = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { sessionId } = req.params;
        const session = await prisma_1.default.interviewSession.findFirst({
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
        await prisma_1.default.$transaction([
            prisma_1.default.interviewAnswer.deleteMany({
                where: {
                    questionId: {
                        in: session.questions.map((q) => q.id),
                    },
                },
            }),
            prisma_1.default.interviewQuestion.deleteMany({
                where: { sessionId: session.id },
            }),
            prisma_1.default.interviewNote.deleteMany({
                where: { sessionId: session.id },
            }),
            prisma_1.default.interviewSession.delete({
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
    }
    catch (error) {
        console.error("Delete interview session error:", error);
        return res.status(500).json({ error: "Failed to delete interview session" });
    }
};
exports.deleteInterviewSession = deleteInterviewSession;
//# sourceMappingURL=interview.controller.js.map