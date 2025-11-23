"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCareerGoal = exports.exportCareerRoadmapPDF = exports.suggestCareerQuizTopics = exports.regenerateCareerRoadmap = exports.updateCareerTaskStatus = exports.getCareerGoal = exports.listCareerGoals = exports.createCareerGoal = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const career_service_1 = require("./career.service");
const pdf_generator_1 = require("../../utils/pdf-generator");
const isValidEnumValue = (enumeration, value) => Object.values(enumeration).includes(value);
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};
const calculateTargetDate = (timeframe, customWeeks) => {
    const now = new Date();
    switch (timeframe) {
        case client_1.Timeframe.THREE_MONTHS:
            return addDays(now, 7 * 12);
        case client_1.Timeframe.SIX_MONTHS:
            return addDays(now, 7 * 26);
        case client_1.Timeframe.TWELVE_MONTHS:
            return addDays(now, 7 * 52);
        case client_1.Timeframe.CUSTOM:
            if (!customWeeks || customWeeks <= 0) {
                return null;
            }
            return addDays(now, 7 * customWeeks);
        default:
            return null;
    }
};
const normalizeTaskType = (value) => {
    if (!value) {
        return client_1.TaskType.LEARNING;
    }
    const upper = value.toUpperCase().replace(/\s+/g, "_");
    return isValidEnumValue(client_1.TaskType, upper) ? upper : client_1.TaskType.LEARNING;
};
const normalizeResourceType = (value) => {
    if (!value) {
        return client_1.ResourceType.COURSE;
    }
    const upper = value.toUpperCase().replace(/\s+/g, "_");
    return isValidEnumValue(client_1.ResourceType, upper)
        ? upper
        : client_1.ResourceType.COURSE;
};
const normalizeDifficulty = (value) => {
    if (!value) {
        return client_1.Difficulty.INTERMEDIATE;
    }
    const upper = value.toUpperCase();
    return isValidEnumValue(client_1.Difficulty, upper)
        ? upper
        : client_1.Difficulty.INTERMEDIATE;
};
const validateAndCleanUrl = (url) => {
    if (!url || typeof url !== "string") {
        return null;
    }
    const trimmedUrl = url.trim();
    if (trimmedUrl === "" || trimmedUrl === "null" || trimmedUrl === "undefined") {
        return null;
    }
    const placeholderPatterns = [
        /example\.com/i,
        /placeholder\.com/i,
        /test\.com/i,
        /sample\.com/i,
        /dummy\.com/i,
        /fake\.com/i,
        /lorem\.com/i,
        /example\.org/i,
        /placeholder\.org/i,
        /test\.org/i,
        /localhost/i,
        /127\.0\.0\.1/i,
        /^https?:\/\/example/i,
        /^https?:\/\/placeholder/i,
        /^https?:\/\/test/i,
    ];
    for (const pattern of placeholderPatterns) {
        if (pattern.test(trimmedUrl)) {
            console.warn(`Rejected placeholder URL: ${trimmedUrl}`);
            return null;
        }
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
        return null;
    }
    return trimmedUrl;
};
const recomputeGoalProgress = async (goalId) => {
    const tasks = await prisma_1.default.careerTask.findMany({
        where: { goalId },
        select: { status: true },
    });
    if (tasks.length === 0) {
        return prisma_1.default.careerGoal.update({
            where: { id: goalId },
            data: { progress: 0 },
        });
    }
    const completedCount = tasks.filter((task) => task.status === client_1.TaskStatus.COMPLETED)
        .length;
    const progress = Math.round((completedCount / tasks.length) * 100);
    return prisma_1.default.careerGoal.update({
        where: { id: goalId },
        data: { progress },
    });
};
const persistRoadmapArtifacts = async ({ goalId, plan, startedAt, }) => {
    for (const phase of plan.phases) {
        let taskOrder = 0;
        if (phase.tasks) {
            for (const task of phase.tasks) {
                const createdTask = await prisma_1.default.careerTask.create({
                    data: {
                        goalId,
                        phase: phase.phase,
                        title: task.title,
                        description: task.description,
                        taskType: normalizeTaskType(task.type),
                        estimatedHours: task.estimatedHours
                            ? Math.round(task.estimatedHours)
                            : null,
                        order: taskOrder,
                        dueDate: typeof task.dueInWeeks === "number"
                            ? addDays(startedAt, task.dueInWeeks * 7)
                            : null,
                    },
                });
                taskOrder += 1;
                if (task.resources) {
                    for (const resource of task.resources) {
                        await prisma_1.default.careerResource.create({
                            data: {
                                goalId,
                                taskId: createdTask.id,
                                title: resource.title,
                                url: validateAndCleanUrl(resource.url),
                                description: resource.description,
                                resourceType: normalizeResourceType(resource.resourceType),
                                estimatedHours: resource.estimatedHours
                                    ? Math.round(resource.estimatedHours)
                                    : null,
                                difficulty: normalizeDifficulty(resource.difficulty),
                            },
                        });
                    }
                }
            }
        }
        if (phase.milestone) {
            await prisma_1.default.careerMilestone.create({
                data: {
                    goalId,
                    title: phase.milestone.title,
                    description: phase.milestone.description,
                    targetDate: addDays(startedAt, (phase.milestone.dueInWeeks || phase.durationWeeks) * 7),
                },
            });
        }
    }
};
const createCareerGoal = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { currentRole, targetRole, timeframe, currentSkills, customWeeks, resumeId, } = req.body;
        if (!currentRole || !targetRole) {
            return res.status(400).json({
                error: "Current role and target role are required",
            });
        }
        if (!timeframe ||
            typeof timeframe !== "string" ||
            !isValidEnumValue(client_1.Timeframe, timeframe)) {
            return res.status(400).json({ error: "Invalid timeframe" });
        }
        let resume = null;
        if (resumeId) {
            resume = await prisma_1.default.resume.findFirst({
                where: {
                    id: resumeId,
                    userId: req.user.id,
                    status: "READY",
                },
                select: {
                    id: true,
                    parsedText: true,
                },
            });
            if (!resume) {
                return res.status(404).json({
                    error: "Resume not found or not ready. Please ensure the resume is uploaded and processed.",
                });
            }
        }
        let normalizedSkills = [];
        if (resume?.parsedText) {
            if (Array.isArray(currentSkills) && currentSkills.length > 0) {
                normalizedSkills = currentSkills
                    .map((skill) => (typeof skill === "string" ? skill.trim() : null))
                    .filter((skill) => Boolean(skill));
            }
        }
        else {
            if (!Array.isArray(currentSkills) || currentSkills.length === 0) {
                return res
                    .status(400)
                    .json({ error: "Provide at least one current skill or upload a resume" });
            }
            normalizedSkills = currentSkills
                .map((skill) => (typeof skill === "string" ? skill.trim() : null))
                .filter((skill) => Boolean(skill));
        }
        if (resume?.parsedText) {
            console.log(`[Career Goal] Using resume for analysis: ${resume.id}, text length: ${resume.parsedText.length}`);
        }
        const analysis = await (0, career_service_1.generateSkillGapAnalysis)({
            currentRole,
            targetRole,
            currentSkills: normalizedSkills,
            timeframe,
            resumeText: resume?.parsedText || null,
        });
        const roadmap = await (0, career_service_1.generateRoadmapPlan)({
            currentRole,
            targetRole,
            timeframe,
            currentSkills: normalizedSkills,
            analysis,
            resumeText: resume?.parsedText || null,
        });
        const targetDate = calculateTargetDate(timeframe, customWeeks);
        const goal = await prisma_1.default.careerGoal.create({
            data: {
                userId: req.user.id,
                currentRole: currentRole.trim(),
                targetRole: targetRole.trim(),
                timeframe,
                currentSkills: normalizedSkills,
                requiredSkills: analysis.requiredSkills,
                skillGapAnalysis: analysis.skillGapAnalysis,
                roadmapPlan: roadmap,
                targetDate,
                status: client_1.GoalStatus.ACTIVE,
            },
        });
        await persistRoadmapArtifacts({
            goalId: goal.id,
            plan: roadmap,
            startedAt: goal.startedAt,
        });
        const fullGoal = await prisma_1.default.careerGoal.findUnique({
            where: { id: goal.id },
            include: {
                tasks: true,
                resources: true,
                milestones: true,
            },
        });
        return res.status(201).json({ goal: fullGoal });
    }
    catch (error) {
        console.error("Create career goal error:", error);
        return res.status(500).json({ error: "Failed to create career goal" });
    }
};
exports.createCareerGoal = createCareerGoal;
const listCareerGoals = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { status } = req.query;
        const statusFilter = typeof status === "string" && isValidEnumValue(client_1.GoalStatus, status)
            ? status
            : undefined;
        const goals = await prisma_1.default.careerGoal.findMany({
            where: {
                userId: req.user.id,
                ...(statusFilter ? { status: statusFilter } : {}),
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                currentRole: true,
                targetRole: true,
                timeframe: true,
                progress: true,
                status: true,
                requiredSkills: true,
                createdAt: true,
                targetDate: true,
            },
        });
        return res.json({ goals });
    }
    catch (error) {
        console.error("List career goals error:", error);
        return res.status(500).json({ error: "Failed to list career goals" });
    }
};
exports.listCareerGoals = listCareerGoals;
const getCareerGoal = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { goalId } = req.params;
        if (!goalId) {
            return res.status(400).json({ error: "Goal ID is required" });
        }
        const goal = await prisma_1.default.careerGoal.findFirst({
            where: { id: goalId, userId: req.user.id },
            include: {
                tasks: {
                    orderBy: [{ phase: "asc" }, { order: "asc" }],
                },
                resources: true,
                milestones: {
                    orderBy: { targetDate: "asc" },
                },
            },
        });
        if (!goal) {
            return res.status(404).json({ error: "Career goal not found" });
        }
        return res.json({ goal });
    }
    catch (error) {
        console.error("Get career goal error:", error);
        return res.status(500).json({ error: "Failed to fetch career goal" });
    }
};
exports.getCareerGoal = getCareerGoal;
const updateCareerTaskStatus = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { goalId, taskId } = req.params;
        if (!goalId || !taskId) {
            return res
                .status(400)
                .json({ error: "Goal ID and task ID are required" });
        }
        const { status } = req.body;
        if (!status || !isValidEnumValue(client_1.TaskStatus, status)) {
            return res.status(400).json({ error: "Invalid task status" });
        }
        const task = await prisma_1.default.careerTask.findFirst({
            where: { id: taskId, goalId, goal: { userId: req.user.id } },
        });
        if (!task) {
            return res.status(404).json({ error: "Career task not found" });
        }
        const updatedTask = await prisma_1.default.careerTask.update({
            where: { id: task.id },
            data: {
                status,
                completedAt: status === client_1.TaskStatus.COMPLETED ? new Date() : null,
            },
        });
        const updatedGoal = await recomputeGoalProgress(goalId);
        return res.json({
            task: updatedTask,
            goal: updatedGoal,
        });
    }
    catch (error) {
        console.error("Update career task status error:", error);
        return res.status(500).json({ error: "Failed to update task status" });
    }
};
exports.updateCareerTaskStatus = updateCareerTaskStatus;
const regenerateCareerRoadmap = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { goalId } = req.params;
        if (!goalId) {
            return res.status(400).json({ error: "Goal ID is required" });
        }
        const goal = await prisma_1.default.careerGoal.findFirst({
            where: { id: goalId, userId: req.user.id },
            include: {
                tasks: true,
            },
        });
        if (!goal) {
            return res.status(404).json({ error: "Career goal not found" });
        }
        const completedSkills = goal.tasks
            .filter((task) => task.status === client_1.TaskStatus.COMPLETED)
            .map((task) => task.title);
        const skillGap = await (0, career_service_1.generateSkillGapAnalysis)({
            currentRole: goal.currentRole,
            targetRole: goal.targetRole,
            timeframe: goal.timeframe,
            currentSkills: Array.from(new Set([...goal.currentSkills, ...completedSkills])),
        });
        const roadmap = await (0, career_service_1.generateRoadmapPlan)({
            currentRole: goal.currentRole,
            targetRole: goal.targetRole,
            timeframe: goal.timeframe,
            currentSkills: goal.currentSkills,
            analysis: skillGap,
            existingProgress: {
                completedSkills,
                blockedAreas: goal.tasks
                    .filter((task) => task.status === client_1.TaskStatus.IN_PROGRESS)
                    .map((task) => task.title),
            },
        });
        await prisma_1.default.$transaction([
            prisma_1.default.careerResource.deleteMany({ where: { goalId: goal.id } }),
            prisma_1.default.careerMilestone.deleteMany({ where: { goalId: goal.id } }),
            prisma_1.default.careerTask.deleteMany({ where: { goalId: goal.id } }),
        ]);
        await prisma_1.default.careerGoal.update({
            where: { id: goal.id },
            data: {
                roadmapPlan: roadmap,
                skillGapAnalysis: skillGap.skillGapAnalysis,
                requiredSkills: skillGap.requiredSkills,
                progress: 0,
            },
        });
        await persistRoadmapArtifacts({
            goalId: goal.id,
            plan: roadmap,
            startedAt: goal.startedAt,
        });
        const refreshedGoal = await prisma_1.default.careerGoal.findUnique({
            where: { id: goal.id },
            include: {
                tasks: true,
                resources: true,
                milestones: true,
            },
        });
        return res.json({
            message: "Career roadmap regenerated",
            goal: refreshedGoal,
        });
    }
    catch (error) {
        console.error("Regenerate career roadmap error:", error);
        return res.status(500).json({ error: "Failed to regenerate roadmap" });
    }
};
exports.regenerateCareerRoadmap = regenerateCareerRoadmap;
const suggestCareerQuizTopics = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { goalId } = req.params;
        if (!goalId) {
            return res.status(400).json({ error: "Goal ID is required" });
        }
        const goal = await prisma_1.default.careerGoal.findFirst({
            where: { id: goalId, userId: req.user.id },
            include: {
                tasks: true,
            },
        });
        if (!goal) {
            return res.status(404).json({ error: "Career goal not found" });
        }
        const pendingTasks = goal.tasks
            .filter((task) => task.status !== client_1.TaskStatus.COMPLETED)
            .map((task) => ({
            title: task.title,
            description: task.description || undefined,
        }));
        const suggestions = await (0, career_service_1.suggestQuizTopicsFromRoadmap)({
            targetRole: goal.targetRole,
            currentRole: goal.currentRole,
            pendingTasks,
        });
        return res.json({
            goalId: goal.id,
            suggestions,
        });
    }
    catch (error) {
        console.error("Suggest career quiz topics error:", error);
        return res.status(500).json({ error: "Failed to suggest quiz topics" });
    }
};
exports.suggestCareerQuizTopics = suggestCareerQuizTopics;
const exportCareerRoadmapPDF = async (req, res) => {
    try {
        if (!req.user?.id) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const { goalId } = req.params;
        const goal = await prisma_1.default.careerGoal.findFirst({
            where: { id: goalId, userId: req.user.id },
            include: {
                tasks: {
                    orderBy: [{ phase: "asc" }, { order: "asc" }],
                },
                resources: true,
                milestones: {
                    orderBy: { targetDate: "asc" },
                },
            },
        });
        if (!goal) {
            res.status(404).json({ error: "Career goal not found" });
            return;
        }
        const doc = (0, pdf_generator_1.generateRoadmapPDF)({ goal });
        const filename = `career-roadmap-${goal.targetRole.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        doc.pipe(res);
        doc.end();
    }
    catch (error) {
        console.error("Export career roadmap PDF error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to export roadmap PDF" });
        }
    }
};
exports.exportCareerRoadmapPDF = exportCareerRoadmapPDF;
const deleteCareerGoal = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { goalId } = req.params;
        const goal = await prisma_1.default.careerGoal.findFirst({
            where: {
                id: goalId,
                userId: req.user.id,
            },
            include: {
                tasks: {
                    select: { id: true },
                },
                resources: {
                    select: { id: true },
                },
                milestones: {
                    select: { id: true },
                },
            },
        });
        if (!goal) {
            return res.status(404).json({ error: "Career goal not found" });
        }
        await prisma_1.default.$transaction([
            prisma_1.default.careerResource.deleteMany({
                where: { goalId: goal.id },
            }),
            prisma_1.default.careerTask.deleteMany({
                where: { goalId: goal.id },
            }),
            prisma_1.default.careerMilestone.deleteMany({
                where: { goalId: goal.id },
            }),
            prisma_1.default.careerGoal.delete({
                where: { id: goal.id },
            }),
        ]);
        return res.json({
            message: "Career goal deleted successfully",
            deletedGoalId: goal.id,
            deletedTargetRole: goal.targetRole,
            deletedTasksCount: goal.tasks.length,
            deletedResourcesCount: goal.resources.length,
            deletedMilestonesCount: goal.milestones.length,
        });
    }
    catch (error) {
        console.error("Delete career goal error:", error);
        return res.status(500).json({ error: "Failed to delete career goal" });
    }
};
exports.deleteCareerGoal = deleteCareerGoal;
//# sourceMappingURL=career.controller.js.map