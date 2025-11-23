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
          },
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
    } = req.body;

    if (!currentRole || !targetRole) {
      return res.status(400).json({
        error: "Current role and target role are required",
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
          error: "Resume not found or not ready. Please ensure the resume is uploaded and processed.",
        });
      }
    }

    // Extract skills from resume or use provided skills
    let normalizedSkills: string[] = [];
    if (resume?.parsedText) {
      // If resume is provided, we'll extract skills from it in the AI analysis
      // But still allow user to provide additional skills
      if (Array.isArray(currentSkills) && currentSkills.length > 0) {
        normalizedSkills = currentSkills
          .map((skill: unknown) => (typeof skill === "string" ? skill.trim() : null))
          .filter((skill): skill is string => Boolean(skill));
      }
    } else {
      // No resume, skills are required
      if (!Array.isArray(currentSkills) || currentSkills.length === 0) {
        return res
          .status(400)
          .json({ error: "Provide at least one current skill or upload a resume" });
      }

      normalizedSkills = currentSkills
        .map((skill: unknown) => (typeof skill === "string" ? skill.trim() : null))
        .filter((skill): skill is string => Boolean(skill));
    }

    // Log if resume is being used
    if (resume?.parsedText) {
      console.log(`[Career Goal] Using resume for analysis: ${resume.id}, text length: ${resume.parsedText.length}`);
    }

    // Generate analysis and roadmap (synchronous - request waits until complete)
    const analysis = await generateSkillGapAnalysis({
      currentRole,
      targetRole,
      currentSkills: normalizedSkills,
      timeframe,
      resumeText: resume?.parsedText || null,
    });

    const roadmap = await generateRoadmapPlan({
      currentRole,
      targetRole,
      timeframe,
      currentSkills: normalizedSkills,
      analysis,
      resumeText: resume?.parsedText || null,
    });

    const targetDate = calculateTargetDate(timeframe, customWeeks);

    // Create goal with full analysis data
    const goal = await prisma.careerGoal.create({
      data: {
        userId: req.user.id,
        currentRole: currentRole.trim(),
        targetRole: targetRole.trim(),
        timeframe,
        currentSkills: normalizedSkills,
        requiredSkills: analysis.requiredSkills,
        skillGapAnalysis:
          analysis.skillGapAnalysis as unknown as Prisma.InputJsonValue,
        roadmapPlan: roadmap as unknown as Prisma.InputJsonValue,
        targetDate,
        status: GoalStatus.ACTIVE,
      },
    });

    // Persist roadmap artifacts (tasks, resources, milestones)
    await persistRoadmapArtifacts({
      goalId: goal.id,
      plan: roadmap,
      startedAt: goal.startedAt,
    });

    // Fetch full goal with all relations
    const fullGoal = await prisma.careerGoal.findUnique({
      where: { id: goal.id },
      include: {
        tasks: true,
        resources: true,
        milestones: true,
      },
    });

    return res.status(201).json({ goal: fullGoal });
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
        timeframe: true,
        progress: true,
        status: true,
        requiredSkills: true,
        createdAt: true,
        targetDate: true,
      },
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

    return res.json({ goal });
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

    const completedSkills = goal.tasks
      .filter((task) => task.status === TaskStatus.COMPLETED)
      .map((task) => task.title);

    const skillGap = await generateSkillGapAnalysis({
      currentRole: goal.currentRole,
      targetRole: goal.targetRole,
      timeframe: goal.timeframe,
      currentSkills: Array.from(
        new Set([...goal.currentSkills, ...completedSkills]),
      ),
    });

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
    });

    await prisma.$transaction([
      prisma.careerResource.deleteMany({ where: { goalId: goal.id } }),
      prisma.careerMilestone.deleteMany({ where: { goalId: goal.id } }),
      prisma.careerTask.deleteMany({ where: { goalId: goal.id } }),
    ]);

    await prisma.careerGoal.update({
      where: { id: goal.id },
      data: {
        roadmapPlan: roadmap as unknown as Prisma.InputJsonValue,
        skillGapAnalysis:
          skillGap.skillGapAnalysis as unknown as Prisma.InputJsonValue,
        requiredSkills: skillGap.requiredSkills,
        progress: 0,
      },
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

    return res.json({
      message: "Career roadmap regenerated",
      goal: refreshedGoal,
    });
  } catch (error: any) {
    console.error("Regenerate career roadmap error:", error);
    return res.status(500).json({ error: "Failed to regenerate roadmap" });
  }
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

    const pendingTasks = goal.tasks
      .filter((task) => task.status !== TaskStatus.COMPLETED)
      .map((task) => ({
        title: task.title,
        description: task.description || undefined,
      }));

    const suggestions = await suggestQuizTopicsFromRoadmap({
      targetRole: goal.targetRole,
      currentRole: goal.currentRole,
      pendingTasks,
    });

    return res.json({
      goalId: goal.id,
      suggestions,
    });
  } catch (error: any) {
    console.error("Suggest career quiz topics error:", error);
    return res.status(500).json({ error: "Failed to suggest quiz topics" });
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

