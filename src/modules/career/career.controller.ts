import { Response } from "express";
import {
  CareerGoal,
  Difficulty,
  GoalStatus,
  Prisma,
  ResourceType,
  TaskStatus,
  TaskType,
  Timeframe,
} from "@prisma/client";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import {
  generateRoadmapPlan,
  generateSkillGapAnalysis,
  suggestQuizTopicsFromRoadmap,
} from "./career.service";

import { generateRoadmapPDF } from "../../utils/pdf-generator";

const isValidEnumValue = <T extends Record<string, string>>(
  enumeration: T,
  value: string,
): value is T[keyof T] => (Object.values(enumeration) as string[]).includes(value);

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const calculateTargetDate = (
  timeframe: Timeframe,
  customWeeks?: number,
): Date | null => {
  const now = new Date();
  switch (timeframe) {
    case Timeframe.THREE_MONTHS:
      return addDays(now, 7 * 12);
    case Timeframe.SIX_MONTHS:
      return addDays(now, 7 * 26);
    case Timeframe.TWELVE_MONTHS:
      return addDays(now, 7 * 52);
    case Timeframe.CUSTOM:
      if (!customWeeks || customWeeks <= 0) {
        return null;
      }
      return addDays(now, 7 * customWeeks);
    default:
      return null;
  }
};

const normalizeTaskType = (value?: string): TaskType => {
  if (!value) {
    return TaskType.LEARNING;
  }
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  return isValidEnumValue(TaskType, upper) ? (upper as TaskType) : TaskType.LEARNING;
};

const normalizeResourceType = (value?: string): ResourceType => {
  if (!value) {
    return ResourceType.COURSE;
  }
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  return isValidEnumValue(ResourceType, upper)
    ? (upper as ResourceType)
    : ResourceType.COURSE;
};

const normalizeDifficulty = (value?: string): Difficulty => {
  if (!value) {
    return Difficulty.INTERMEDIATE;
  }
  const upper = value.toUpperCase();
  return isValidEnumValue(Difficulty, upper)
    ? (upper as Difficulty)
    : Difficulty.INTERMEDIATE;
};

const validateAndCleanUrl = (url?: string | null): string | null => {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl === "" || trimmedUrl === "null" || trimmedUrl === "undefined") {
    return null;
  }

  // List of placeholder/fake domain patterns to reject
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
    // If it's not a valid URL format, return null
    return null;
  }

  return trimmedUrl;
};

const recomputeGoalProgress = async (goalId: string): Promise<CareerGoal> => {
  const tasks = await prisma.careerTask.findMany({
    where: { goalId },
    select: { status: true },
  });

  if (tasks.length === 0) {
    return prisma.careerGoal.update({
      where: { id: goalId },
      data: { progress: 0 },
    });
  }

  const completedCount = tasks.filter((task) => task.status === TaskStatus.COMPLETED)
    .length;
  const progress = Math.round((completedCount / tasks.length) * 100);

  return prisma.careerGoal.update({
    where: { id: goalId },
    data: { progress },
  });
};

const persistRoadmapArtifacts = async ({
  goalId,
  plan,
  startedAt,
}: {
  goalId: string;
  plan: {
    phases: Array<{
      phase: number;
      durationWeeks: number;
      tasks?: Array<{
        title: string;
        description?: string;
        type?: string;
        estimatedHours?: number;
        dueInWeeks?: number;
        subtopics?: string[];
        suggestedProjects?: Array<{
          title: string;
          description: string;
          difficulty?: string;
        }>;
        resources?: Array<{
          title: string;
          url?: string;
          resourceType?: string;
          description?: string;
          estimatedHours?: number;
          difficulty?: string;
        }>;
      }>;
      milestone?: {
        title: string;
        dueInWeeks: number;
        description?: string;
      };
    }>;
  };
  startedAt: Date;
}) => {
  for (const phase of plan.phases) {
    let taskOrder = 0;
    if (phase.tasks) {
      for (const task of phase.tasks) {
        const createdTask = await prisma.careerTask.create({
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
            dueDate:
              typeof task.dueInWeeks === "number"
                ? addDays(startedAt, task.dueInWeeks * 7)
                : null,
            subtopics: task.subtopics && task.subtopics.length > 0 
              ? (task.subtopics as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            suggestedProjects: task.suggestedProjects && task.suggestedProjects.length > 0
              ? (task.suggestedProjects as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          } as any, // Type assertion needed until Prisma Client is regenerated
        });
        taskOrder += 1;

        if (task.resources) {
          for (const resource of task.resources) {
            await prisma.careerResource.create({
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
      await prisma.careerMilestone.create({
        data: {
          goalId,
          title: phase.milestone.title,
          description: phase.milestone.description,
          targetDate: addDays(
            startedAt,
            (phase.milestone.dueInWeeks || phase.durationWeeks) * 7,
          ),
        },
      });
    }
  }
};

export const createCareerGoal = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      currentRole,
      targetRole,
      timeframe,
      currentSkills,
      customWeeks,
      resumeId,
      targetCountryCode,
      targetLocation,
    } = req.body;

    if (
      !targetRole ||
      typeof targetRole !== "string" ||
      targetRole.trim().length === 0
    ) {
      return res.status(400).json({
        error: "Target role is required",
      });
    }

    const normalizedTargetRole = targetRole.trim();

    let effectiveCurrentRole =
      typeof currentRole === "string" && currentRole.trim().length > 0
        ? currentRole.trim()
        : null;

    if (!effectiveCurrentRole) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { currentPosition: true },
      });
      effectiveCurrentRole = user?.currentPosition || null;
    }

    if (!effectiveCurrentRole) {
      return res.status(400).json({
        error:
          "Current role is required. Please provide it or complete onboarding first.",
      });
    }

    if (
      !timeframe ||
      typeof timeframe !== "string" ||
      !isValidEnumValue(Timeframe, timeframe)
    ) {
      return res.status(400).json({ error: "Invalid timeframe" });
    }

    // Fetch resume if provided
    let resume: { id: string; parsedText: string | null } | null = null;
    if (resumeId) {
      resume = await prisma.resume.findFirst({
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
          error:
            "Resume not found or not ready. Please ensure the resume is uploaded and processed.",
        });
      }
    }

    // Normalize manually provided skills (optional)
    let normalizedSkills: string[] =
      Array.isArray(currentSkills) && currentSkills.length > 0
        ? currentSkills
            .map((skill: unknown) =>
              typeof skill === "string" ? skill.trim() : null,
            )
            .filter((skill): skill is string => Boolean(skill))
        : [];

    let analysis: Awaited<ReturnType<typeof generateSkillGapAnalysis>> | null =
      null;

    if (resume?.parsedText) {
      console.log(
        `[Career Goal] Using resume for analysis: ${resume.id}, text length: ${resume.parsedText.length}`,
      );

      analysis = await generateSkillGapAnalysis({
        currentRole: effectiveCurrentRole,
        targetRole: normalizedTargetRole,
        currentSkills: normalizedSkills,
        timeframe,
        resumeText: resume.parsedText,
      });

      if (analysis?.requiredSkills?.length) {
        normalizedSkills = analysis.requiredSkills;
      }
    }

    // Job market insights removed - using new job matching system instead
    // Users can get market insights from /api/jobs/trends endpoint
    const jobMarketInsights = null;

    const roadmap = await generateRoadmapPlan({
      currentRole: effectiveCurrentRole,
      targetRole: normalizedTargetRole,
      timeframe,
      currentSkills: normalizedSkills,
      analysis,
      resumeText: resume?.parsedText || null,
      jobMarketInsights,
    });

    const targetDate = calculateTargetDate(timeframe, customWeeks);

    const serializedJobMarketInsights = jobMarketInsights
      ? (JSON.parse(JSON.stringify(jobMarketInsights)) as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    const goal = await prisma.careerGoal.create({
      data: {
        userId: req.user.id,
        currentRole: effectiveCurrentRole,
        targetRole: normalizedTargetRole,
        targetCountryCode:
          normalizedCountryCode || defaultCountryCode || null,
        targetLocation: normalizedLocation || null,
        timeframe,
        currentSkills: normalizedSkills,
        requiredSkills: analysis?.requiredSkills || [],
        skillGapAnalysis: analysis
          ? (analysis.skillGapAnalysis as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        roadmapPlan: roadmap as unknown as Prisma.InputJsonValue,
        jobMarketInsights: serializedJobMarketInsights,
        jobMarketUpdatedAt: jobMarketInsights ? new Date() : null,
        targetDate,
        status: GoalStatus.ACTIVE,
      } as any,
    });

    // Persist roadmap artifacts (tasks, resources, milestones)
    await persistRoadmapArtifacts({
      goalId: goal.id,
      plan: roadmap,
      startedAt: goal.startedAt,
    });

    // Increment usage count
    const { incrementCareerRoadmapCount } = await import("../../utils/usage");
    await incrementCareerRoadmapCount(req.user.id);

    // Fetch full goal with all relations
    const fullGoal = await prisma.careerGoal.findUnique({
      where: { id: goal.id },
      include: {
        tasks: true,
        resources: true,
        milestones: true,
      },
    });

    const responseGoal = fullGoal
      ? {
          ...fullGoal,
          jobMarketInsights:
            jobMarketInsights ??
            (((fullGoal as any).jobMarketInsights as JobMarketInsights | null) ||
              null),
        }
      : fullGoal;

    return res.status(201).json({
      goal: responseGoal,
      jobMarketInsights: jobMarketInsights ?? null,
    });
  } catch (error: any) {
    console.error("Create career goal error:", error);
    return res.status(500).json({ error: "Failed to create career goal" });
  }
};

export const listCareerGoals = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status } = req.query;

    const statusFilter =
      typeof status === "string" && isValidEnumValue(GoalStatus, status)
        ? (status as GoalStatus)
        : undefined;

    const goals = await prisma.careerGoal.findMany({
      where: {
        userId: req.user.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        currentRole: true,
        targetRole: true,
        targetCountryCode: true,
        targetLocation: true,
        timeframe: true,
        progress: true,
        status: true,
        requiredSkills: true,
        createdAt: true,
        targetDate: true,
        jobMarketUpdatedAt: true,
      } as any,
    });

    return res.json({ goals });
  } catch (error: any) {
    console.error("List career goals error:", error);
    return res.status(500).json({ error: "Failed to list career goals" });
  }
};

export const getCareerGoal = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;

    if (!goalId) {
      return res.status(400).json({ error: "Goal ID is required" });
    }

    const goal = await prisma.careerGoal.findFirst({
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

    const goalRecord = goal as any;
    const jobMarketInsights: JobMarketInsights | null =
      (goalRecord.jobMarketInsights as JobMarketInsights | null) ?? null;

    const responseGoal = {
      ...goal,
      jobMarketInsights,
    };

    return res.json({ goal: responseGoal });
  } catch (error: any) {
    console.error("Get career goal error:", error);
    return res.status(500).json({ error: "Failed to fetch career goal" });
  }
};

export const updateCareerTaskStatus = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
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

    if (!status || !isValidEnumValue(TaskStatus, status)) {
      return res.status(400).json({ error: "Invalid task status" });
    }

    const task = await prisma.careerTask.findFirst({
      where: { id: taskId, goalId, goal: { userId: req.user.id } },
    });

    if (!task) {
      return res.status(404).json({ error: "Career task not found" });
    }

    const updatedTask = await prisma.careerTask.update({
      where: { id: task.id },
      data: {
        status,
        completedAt: status === TaskStatus.COMPLETED ? new Date() : null,
      },
    });

    const updatedGoal = await recomputeGoalProgress(goalId);

    return res.json({
      task: updatedTask,
      goal: updatedGoal,
    });
  } catch (error: any) {
    console.error("Update career task status error:", error);
    return res.status(500).json({ error: "Failed to update task status" });
  }
};

export const regenerateCareerRoadmap = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;

    if (!goalId) {
      return res.status(400).json({ error: "Goal ID is required" });
    }

    const goal = await prisma.careerGoal.findFirst({
      where: { id: goalId, userId: req.user.id },
      include: {
        tasks: true,
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Career goal not found" });
    }

    const defaultCountryCode =
      process.env.ADZUNA_DEFAULT_COUNTRY?.trim().toLowerCase() || null;

    const goalRecord = goal as any;

    let jobMarketInsights: JobMarketInsights | null =
      (goalRecord.jobMarketInsights as JobMarketInsights | null) ?? null;

    if (
      !jobMarketInsights ||
      shouldRefreshJobMarketInsights(goalRecord.jobMarketUpdatedAt)
    ) {
      try {
        const refreshed = await fetchAdzunaJobInsights({
          role: goal.targetRole,
          location: goalRecord.targetLocation || undefined,
          country:
            goalRecord.targetCountryCode ||
            defaultCountryCode ||
            undefined,
        });
        if (refreshed) {
          jobMarketInsights = refreshed;
        }
      } catch (insightsError) {
        console.error(
          "[Career Goal] Failed to refresh Adzuna job insights:",
          insightsError,
        );
      }
    }

    const completedSkills = goal.tasks
      .filter((task) => task.status === TaskStatus.COMPLETED)
      .map((task) => task.title);

    // Only regenerate skill gap analysis if goal originally had one (meaning resume was used)
    let skillGap: Awaited<ReturnType<typeof generateSkillGapAnalysis>> | null = null;
    
    if (goal.skillGapAnalysis) {
      // Goal was created with resume, regenerate analysis
      skillGap = await generateSkillGapAnalysis({
        currentRole: goal.currentRole,
        targetRole: goal.targetRole,
        timeframe: goal.timeframe,
        currentSkills: Array.from(
          new Set([...goal.currentSkills, ...completedSkills]),
        ),
        resumeText: null, // Resume not available in regeneration
      });
    }

    const roadmap = await generateRoadmapPlan({
      currentRole: goal.currentRole,
      targetRole: goal.targetRole,
      timeframe: goal.timeframe,
      currentSkills: goal.currentSkills,
      analysis: skillGap,
      existingProgress: {
        completedSkills,
        blockedAreas: goal.tasks
          .filter((task) => task.status === TaskStatus.IN_PROGRESS)
          .map((task) => task.title),
      },
      jobMarketInsights,
    });

    await prisma.$transaction([
      prisma.careerResource.deleteMany({ where: { goalId: goal.id } }),
      prisma.careerMilestone.deleteMany({ where: { goalId: goal.id } }),
      prisma.careerTask.deleteMany({ where: { goalId: goal.id } }),
    ]);

    const updateData: Prisma.CareerGoalUpdateInput = {
      roadmapPlan: roadmap as unknown as Prisma.InputJsonValue,
      requiredSkills: skillGap ? skillGap.requiredSkills : goal.requiredSkills,
      skillGapAnalysis: skillGap
        ? (skillGap.skillGapAnalysis as unknown as Prisma.InputJsonValue)
        : (goal.skillGapAnalysis as Prisma.InputJsonValue),
      progress: 0,
    };

    if (jobMarketInsights) {
      (updateData as any).jobMarketInsights = JSON.parse(
        JSON.stringify(jobMarketInsights),
      ) as Prisma.InputJsonValue;
      (updateData as any).jobMarketUpdatedAt = new Date();
    }

    await prisma.careerGoal.update({
      where: { id: goal.id },
      data: updateData,
    });

    await persistRoadmapArtifacts({
      goalId: goal.id,
      plan: roadmap,
      startedAt: goal.startedAt,
    });

    const refreshedGoal = await prisma.careerGoal.findUnique({
      where: { id: goal.id },
      include: {
        tasks: true,
        resources: true,
        milestones: true,
      },
    });

    const responseGoal = refreshedGoal
      ? {
          ...refreshedGoal,
          jobMarketInsights:
            jobMarketInsights ??
            (((refreshedGoal as any).jobMarketInsights as JobMarketInsights | null) ||
              null),
        }
      : refreshedGoal;

    return res.json({
      message: "Career roadmap regenerated",
      goal: responseGoal,
      jobMarketInsights: jobMarketInsights ?? null,
    });
  } catch (error: any) {
    console.error("Regenerate career roadmap error:", error);
    return res.status(500).json({ error: "Failed to regenerate roadmap" });
  }
};

// Helper: Determine current phase based on progress
const getCurrentPhase = (tasks: Array<{ phase: number; status: TaskStatus }>): number => {
  if (tasks.length === 0) return 1;

  // Group tasks by phase
  const phaseStats = tasks.reduce((acc, task) => {
    if (!acc[task.phase]) {
      acc[task.phase] = { total: 0, completed: 0 };
    }
    acc[task.phase]!.total++;
    if (task.status === TaskStatus.COMPLETED) {
      acc[task.phase]!.completed++;
    }
    return acc;
  }, {} as Record<number, { total: number; completed: number }>);

  // Find the first phase that's not fully completed
  const phases = Object.keys(phaseStats)
    .map(Number)
    .sort((a, b) => a - b);

  for (const phase of phases) {
    const stats = phaseStats[phase];
    if (!stats || stats.total === 0) continue;
    const completionRate = stats.completed / stats.total;
    // If phase is less than 80% complete, it's the current phase
    if (completionRate < 0.8) {
      return phase;
    }
  }

  // All phases complete, return the last phase
  return phases.length > 0 ? phases[phases.length - 1]! : 1;
};

// Helper: Check if suggestions need regeneration
const shouldRegenerateSuggestions = async (
  goalId: string,
  currentProgress: number,
): Promise<boolean> => {
  // Get last suggestion generation time
  const lastSuggestion = await prisma.careerQuizSuggestion.findFirst({
    where: { goalId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!lastSuggestion) {
    return true; // No suggestions exist, generate them
  }

  // Check if progress changed significantly (more than 5%)
  const goal = await prisma.careerGoal.findUnique({
    where: { id: goalId },
    select: { progress: true },
  });

  if (!goal) return false;

  const progressDiff = Math.abs(currentProgress - goal.progress);
  if (progressDiff >= 5) {
    return true; // Significant progress change
  }

  // Check if suggestions are older than 7 days
  const daysSinceLastSuggestion =
    (Date.now() - lastSuggestion.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLastSuggestion >= 7) {
    return true; // Suggestions are stale
  }

  return false;
};

export const suggestCareerQuizTopics = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;
    const { forceRegenerate } = req.query; // Optional query param to force regeneration

    if (!goalId) {
      return res.status(400).json({ error: "Goal ID is required" });
    }

    const goal = await prisma.careerGoal.findFirst({
      where: { id: goalId, userId: req.user.id },
      include: {
        tasks: {
          orderBy: [{ phase: "asc" }, { order: "asc" }],
        },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Career goal not found" });
    }

    // Determine current phase based on progress
    const currentPhase = getCurrentPhase(
      goal.tasks.map((t) => ({ phase: t.phase, status: t.status })),
    );

    // Get tasks for current and next phase only (progress-based)
    const relevantPhases = [currentPhase, currentPhase + 1];
    const relevantTasks = goal.tasks.filter(
      (task) =>
        relevantPhases.includes(task.phase) &&
        task.status !== TaskStatus.COMPLETED,
    );

    console.log(
      `[Quiz Suggestions] Goal: ${goal.id}, Current phase: ${currentPhase}, Relevant tasks: ${relevantTasks.length}`,
    );

    // Check if we should regenerate suggestions
    const shouldRegenerate =
      forceRegenerate === "true" ||
      (await shouldRegenerateSuggestions(goalId, goal.progress));

    let newSuggestions: any[] = [];

    if (shouldRegenerate) {
      console.log("[Quiz Suggestions] Regenerating suggestions...");

      // Get existing suggestions and quizzes for deduplication
      const existingSuggestions = await prisma.careerQuizSuggestion.findMany({
        where: { goalId, isActive: true },
        select: { suggestedQuizTitle: true },
      });

      const existingQuizzes = await prisma.quiz.findMany({
        where: { careerGoalId: goalId, userId: req.user.id },
        select: { title: true },
      });

      const existingTitles = new Set([
        ...existingSuggestions.map((s: any) => s.suggestedQuizTitle.toLowerCase()),
        ...existingQuizzes.map((q) => q.title.toLowerCase()),
      ]);

      // Generate new suggestions
      try {
        const pendingTasks = relevantTasks.map((task) => ({
          title: task.title,
          description: task.description || undefined,
        }));

        const aiSuggestions = await suggestQuizTopicsFromRoadmap({
          targetRole: goal.targetRole,
          currentRole: goal.currentRole,
          pendingTasks: pendingTasks.length > 0
            ? pendingTasks
            : [
                {
                  title: `Transition from ${goal.currentRole} to ${goal.targetRole}`,
                  description: "General skill development",
                },
              ],
        });

        // Deduplicate and filter
        const uniqueSuggestions = aiSuggestions.filter((suggestion) => {
          const titleLower = suggestion.suggestedQuizTitle.toLowerCase();
          return !existingTitles.has(titleLower);
        });

        // Limit to 3 suggestions
        const limitedSuggestions = uniqueSuggestions.slice(0, 3);

        // Deactivate old suggestions
        await prisma.careerQuizSuggestion.updateMany({
          where: { goalId, isActive: true },
          data: { isActive: false },
        });

        // Save new suggestions to DB
        for (const suggestion of limitedSuggestions) {
          const linkedTask = relevantTasks.find(
            (t) => t.title === suggestion.linkedTaskTitle,
          );

          await prisma.careerQuizSuggestion.create({
            data: {
              goalId: goal.id,
              skill: suggestion.skill,
              suggestedQuizTitle: suggestion.suggestedQuizTitle,
              difficulty: suggestion.difficulty,
              reason: suggestion.reason,
              linkedTaskTitle: suggestion.linkedTaskTitle || null,
              linkedTaskId: linkedTask?.id || null,
              phase: linkedTask?.phase || currentPhase,
              isActive: true,
            },
          });
        }

        newSuggestions = limitedSuggestions;
        console.log(
          `[Quiz Suggestions] Saved ${limitedSuggestions.length} new suggestions`,
        );
      } catch (error: any) {
        console.error("[Quiz Suggestions] Error generating suggestions:", error);
      }
    }

    // Fetch active suggestions from DB
    const dbSuggestions = await prisma.careerQuizSuggestion.findMany({
      where: {
        goalId: goal.id,
        isActive: true,
        phase: {
          in: relevantPhases, // Only show suggestions for current/next phase
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5, // Limit to 5 active suggestions
    });

    // If no suggestions in DB, use newly generated ones
    const suggestions =
      dbSuggestions.length > 0
        ? dbSuggestions.map((s) => ({
            skill: s.skill,
            suggestedQuizTitle: s.suggestedQuizTitle,
            difficulty: s.difficulty,
            reason: s.reason,
            linkedTaskTitle: s.linkedTaskTitle || undefined,
            phase: s.phase || undefined,
          }))
        : newSuggestions;

    // Get existing quizzes
    const existingQuizzes = await prisma.quiz.findMany({
      where: {
        careerGoalId: goal.id,
        userId: req.user.id,
      },
      select: {
        id: true,
        title: true,
        difficulty: true,
        count: true,
        status: true,
        createdAt: true,
        attempts: {
          select: {
            id: true,
            status: true,
            score: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      goalId: goal.id,
      currentPhase,
      suggestions,
      quizzes: existingQuizzes,
      regenerated: shouldRegenerate,
    });
  } catch (error: any) {
    console.error("Suggest career quiz topics error:", error);
    return res.status(500).json({ error: "Failed to suggest quiz topics" });
  }
};

export const createQuizFromRecommendation = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;
    const { suggestedQuizTitle, difficulty, questionCount, skill, suggestionId } = req.body;

    if (!goalId) {
      return res.status(400).json({ error: "Goal ID is required" });
    }

    if (!suggestedQuizTitle || typeof suggestedQuizTitle !== "string") {
      return res.status(400).json({ error: "suggestedQuizTitle is required" });
    }

    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return res.status(400).json({
        error: "difficulty is required and must be BEGINNER, INTERMEDIATE, or ADVANCED",
      });
    }

    const parsedQuestionCount =
      typeof questionCount === "number" && questionCount > 0
        ? Math.min(questionCount, 50)
        : 10; // Default to 10 questions

    const goal = await prisma.careerGoal.findFirst({
      where: { id: goalId, userId: req.user.id },
    });

    if (!goal) {
      return res.status(404).json({ error: "Career goal not found" });
    }

  
    const quizReq = {
      ...req,
      body: {
        title: suggestedQuizTitle.trim(),
        difficulty,
        questionCount: parsedQuestionCount,
        quizType: "MULTIPLE_CHOICE",
        timer: null,
        topicId: null, // No topic for career roadmap quizzes
        topic: skill || suggestedQuizTitle, // Use skill or title as topic context
        careerGoalId: goal.id,
      },
    } as any;

    // Import quiz controller to reuse creation logic
    const { createQuiz } = await import("../quiz/quiz.controller");
    
    // Create a response wrapper to capture the result
    let quizResult: any = null;
    let statusCode = 201;
    
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            quizResult = data;
            return mockRes;
          },
        };
      },
    } as any;

    await createQuiz(quizReq, mockRes);

    if (statusCode >= 400) {
      return res.status(statusCode).json(quizResult);
    }

    // Mark suggestion as inactive if suggestionId provided
    if (suggestionId) {
      await prisma.careerQuizSuggestion.updateMany({
        where: {
          id: suggestionId,
          goalId: goal.id,
        },
        data: { isActive: false },
      }).catch(console.error);
    } else {
      // Mark suggestion inactive by title match
      await prisma.careerQuizSuggestion.updateMany({
        where: {
          goalId: goal.id,
          suggestedQuizTitle: suggestedQuizTitle.trim(),
          isActive: true,
        },
        data: { isActive: false },
      }).catch(console.error);
    }

    return res.status(201).json({
      message: "Quiz created from recommendation",
      quiz: quizResult,
    });
  } catch (error: any) {
    console.error("Create quiz from recommendation error:", error);
    return res.status(500).json({ error: "Failed to create quiz from recommendation" });
  }
};

export const exportCareerRoadmapPDF = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { goalId } = req.params;

    const goal = await prisma.careerGoal.findFirst({
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

    const doc = generateRoadmapPDF({ goal });

    // Set response headers
    const filename = `career-roadmap-${goal.targetRole.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );

    // Pipe PDF to response
    doc.pipe(res);
    doc.end();

    // Note: Response is handled by PDF stream, no need to return
  } catch (error: any) {
    console.error("Export career roadmap PDF error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to export roadmap PDF" });
    }
  }
};

export const deleteCareerGoal = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;

    const goal = await prisma.careerGoal.findFirst({
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

    await prisma.$transaction([
      // Delete resources
      prisma.careerResource.deleteMany({
        where: { goalId: goal.id },
      }),
      // Delete tasks
      prisma.careerTask.deleteMany({
        where: { goalId: goal.id },
      }),
      // Delete milestones
      prisma.careerMilestone.deleteMany({
        where: { goalId: goal.id },
      }),
      // Delete the goal
      prisma.careerGoal.delete({
        where: { id: goal.id },
      }),
    ]);

    // Decrement usage count (only if goal was ACTIVE)
    if (goal.status === "ACTIVE") {
      const { decrementCareerRoadmapCount } = await import("../../utils/usage");
      await decrementCareerRoadmapCount(req.user.id);
    }

    return res.json({
      message: "Career goal deleted successfully",
      deletedGoalId: goal.id,
      deletedTargetRole: goal.targetRole,
      deletedTasksCount: goal.tasks.length,
      deletedResourcesCount: goal.resources.length,
      deletedMilestonesCount: goal.milestones.length,
    });
  } catch (error: any) {
    console.error("Delete career goal error:", error);
    return res.status(500).json({ error: "Failed to delete career goal" });
  }
};

