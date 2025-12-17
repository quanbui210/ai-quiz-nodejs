import { Request, Response } from "express";
import {
  Difficulty,
  Prisma,
  ResourceType,
  SkillLevel,
  SkillMasteryStatus,
  TaskStatus,
  TaskType,
} from "@prisma/client";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import {
  generateSkillMasteryRoadmap,
  SkillMasteryInput,
  SkillMasteryPlan,
} from "./skill-mastery.service";
import {
  registerJob,
  unregisterJob,
  cancelJob,
} from "../career/career-job-manager";
import { CreditService, Feature } from "../../services/credit.service";

const isValidEnumValue = <T extends Record<string, string>>(
  enumeration: T,
  value: string,
): value is T[keyof T] => (Object.values(enumeration) as string[]).includes(value);

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
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

const normalizeSkillLevel = (value?: string | null): SkillLevel | null => {
  if (!value) {
    return null;
  }
  const upper = value.toUpperCase();
  return isValidEnumValue(SkillLevel, upper) ? (upper as SkillLevel) : null;
};

/**
 * Get or create a Skill by name
 * This helper ensures we always have a Skill record for a given skill name
 */
const getOrCreateSkill = async (
  skillName: string,
  category?: string | null,
): Promise<string> => {
  const trimmedName = skillName.trim();
  
  // Try to find existing skill by name
  let skill = await prisma.skill.findUnique({
    where: { name: trimmedName },
  });

  if (skill) {
    // Update category if provided and not set
    if (category && !skill.category) {
      skill = await prisma.skill.update({
        where: { id: skill.id },
        data: { category },
      });
    }
    return skill.id;
  }

  // Create new skill
  skill = await prisma.skill.create({
    data: {
      name: trimmedName,
      category: category || null,
    },
  });

  return skill.id;
};

const validateAndCleanUrl = (url?: string | null): string | null => {
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

const recomputeSkillMasteryProgress = async (goalId: string) => {
  const tasks = await prisma.skillMasteryTask.findMany({
    where: { goalId },
    select: { status: true },
  });

  if (tasks.length === 0) {
    return prisma.skillMasteryGoal.update({
      where: { id: goalId },
      data: { progress: 0 },
    });
  }

  const completedCount = tasks.filter((task) => task.status === TaskStatus.COMPLETED)
    .length;
  const progress = Math.round((completedCount / tasks.length) * 100);

  return prisma.skillMasteryGoal.update({
    where: { id: goalId },
    data: { progress },
  });
};

/**
 * Process skill mastery roadmap generation asynchronously in the background
 */
async function processSkillMasteryRoadmapAsync(
  goalId: string,
  roadmapInput: SkillMasteryInput,
  abortSignal: AbortSignal,
  targetDate: Date | null,
): Promise<void> {
  try {
    const roadmap = await generateSkillMasteryRoadmap(roadmapInput, abortSignal);

    if (abortSignal.aborted) {
      console.log(`[Skill Mastery] Roadmap generation cancelled for goal ${goalId}`);
      await prisma.skillMasteryGoal.update({
        where: { id: goalId },
        data: { status: SkillMasteryStatus.CANCELLED },
      });
      unregisterJob(goalId);
      return;
    }

    const targetDate = roadmap.totalWeeks
      ? addDays(new Date(), roadmap.totalWeeks * 7)
      : null;

    await prisma.skillMasteryGoal.update({
      where: { id: goalId },
      data: {
        roadmapPlan: roadmap as unknown as Prisma.InputJsonValue,
        overview: roadmap.overview,
        totalWeeks: roadmap.totalWeeks,
        currentLevel: roadmap.currentLevel
          ? (normalizeSkillLevel(roadmap.currentLevel) as SkillLevel | null)
          : null,
        targetDate,
        status: SkillMasteryStatus.ACTIVE,
      } as any,
    });

    const goal = await prisma.skillMasteryGoal.findUnique({
      where: { id: goalId },
      select: { startedAt: true },
    });

    if (goal) {
      await persistSkillMasteryArtifacts({
        goalId,
        plan: roadmap,
        startedAt: goal.startedAt,
      });
    }

    unregisterJob(goalId);
    console.log(`[Skill Mastery] Roadmap generation completed for goal ${goalId}`);
  } catch (error: any) {
    unregisterJob(goalId);

    if (error.message?.includes("cancelled") || abortSignal.aborted) {
      console.log(`[Skill Mastery] Roadmap generation cancelled for goal ${goalId}`);
      await prisma.skillMasteryGoal.update({
        where: { id: goalId },
        data: { status: SkillMasteryStatus.CANCELLED },
      });
      return;
    }

    console.error(`[Skill Mastery] Roadmap generation failed for goal ${goalId}:`, error);
    await prisma.skillMasteryGoal.update({
      where: { id: goalId },
      data: {
        status: SkillMasteryStatus.ACTIVE,
      },
    });
    throw error;
  }
}

/**
 * Clone template artifacts (tasks, resources, milestones, concepts) to a goal
 */
const cloneTemplateArtifacts = async ({
  templateId,
  goalId,
  startedAt,
}: {
  templateId: string;
  goalId: string;
  startedAt: Date;
}) => {
  const template = await prisma.skillMasteryTemplate.findUnique({
    where: { id: templateId },
    select: { roadmapPlan: true },
  });

  if (!template || !template.roadmapPlan) {
    throw new Error("Template not found or invalid");
  }

  const plan = template.roadmapPlan as unknown as SkillMasteryPlan;
  await persistSkillMasteryArtifacts({ goalId, plan, startedAt });
};

const persistSkillMasteryArtifacts = async ({
  goalId,
  plan,
  startedAt,
}: {
  goalId: string;
  plan: SkillMasteryPlan;
  startedAt: Date;
}) => {
  for (const phase of plan.phases) {
    let taskOrder = 0;
    if (phase.tasks) {
      for (const task of phase.tasks) {
        const createdTask = await prisma.skillMasteryTask.create({
          data: {
            goalId,
            phase: phase.phase,
            title: task.title,
            description: task.description,
            taskType: normalizeTaskType(task.type),
            estimatedHours: task.estimatedHours ? Math.round(task.estimatedHours) : null,
            order: taskOrder,
            dueDate:
              typeof task.dueInWeeks === "number"
                ? addDays(startedAt, task.dueInWeeks * 7)
                : null,
            subtopics:
              task.subtopics && task.subtopics.length > 0
                ? (task.subtopics as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            suggestedProjects:
              task.suggestedProjects && task.suggestedProjects.length > 0
                ? (task.suggestedProjects as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            theory:
              task.theory
                ? (task.theory as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            examples:
              task.examples && task.examples.length > 0
                ? (task.examples as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            concepts:
              task.concepts && task.concepts.length > 0
                ? (task.concepts as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
          } as any,
        });
        taskOrder += 1;

        if (task.resources) {
          for (const resource of task.resources) {
            await prisma.skillMasteryResource.create({
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
                isPaid: resource.isPaid ?? null,
                price: resource.price ?? null,
                source: resource.source || "llm",
                isUpToDate: resource.isUpToDate ?? null,
              },
            });
          }
        }
      }
    }

    if (phase.milestone) {
      await prisma.skillMasteryMilestone.create({
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

export const createSkillMasteryGoal = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  let creditTransactionId: string | undefined;
  
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Deduct credits upfront (middleware already checked availability)
    const { newBalance, transactionId } = await CreditService.deductCredits(
      req.user.id,
      Feature.SKILL_MASTERY_ROADMAP,
      { action: "create_skill_mastery_roadmap" }
    );
    creditTransactionId = transactionId;
    console.log(`[Skill Mastery] Deducted credits. New balance: ${newBalance}. Transaction: ${transactionId}`);

    const {
      skillName,
      targetLevel,
      currentLevel,
      currentSkills,
      includeCertification,
      useWebSearch,
      careerGoalId,
      resumeId,
    } = req.body;

    if (!skillName || typeof skillName !== "string" || skillName.trim().length === 0) {
      return res.status(400).json({
        error: "skillName is required and must be a non-empty string",
      });
    }

    if (
      !targetLevel ||
      typeof targetLevel !== "string" ||
      !isValidEnumValue(SkillLevel, targetLevel)
    ) {
      return res.status(400).json({
        error: "targetLevel is required and must be INTERMEDIATE, ADVANCED, or EXPERT",
      });
    }

    // Validate careerGoalId if provided
    if (careerGoalId) {
      const careerGoal = await prisma.careerGoal.findFirst({
        where: { id: careerGoalId, userId: req.user.id },
      });
      if (!careerGoal) {
        return res.status(404).json({ error: "Career goal not found" });
      }
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

    // Normalize skills
    let normalizedSkills: string[] =
      Array.isArray(currentSkills) && currentSkills.length > 0
        ? currentSkills
            .map((skill: unknown) =>
              typeof skill === "string" ? skill.trim() : null,
            )
            .filter((skill): skill is string => Boolean(skill))
        : [];

    const normalizedCurrentLevel = currentLevel
      ? normalizeSkillLevel(currentLevel)
      : null;

    const normalizedIncludeCertification = includeCertification || false;

    const skillId = await getOrCreateSkill(skillName.trim(), undefined);

    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      select: { name: true },
    });
    const normalizedSkillName = skill?.name || skillName.trim();

   
    const template = await prisma.skillMasteryTemplate.findFirst({
      where: {
        OR: [
          {
            skillId,
            targetLevel: targetLevel as SkillLevel,
            includeCertification: normalizedIncludeCertification,
          },
          {
            skillName: skillName.trim(),
            targetLevel: targetLevel as SkillLevel,
            includeCertification: normalizedIncludeCertification,
          },
        ],
      },
    });

    if (template && template.isActive) {
      // Clone from template (instant, no AI call)
      console.log(`[Skill Mastery] Cloning template for ${normalizedSkillName} (${targetLevel})`);

      const startedAt = new Date();
      const targetDate = template.totalWeeks
        ? addDays(startedAt, template.totalWeeks * 7)
        : null;

      const goal = await prisma.skillMasteryGoal.create({
        data: {
          userId: req.user.id,
          skillId,
          skillName: normalizedSkillName, // Set skillName to ensure it's not null
          skillCategory: template.skillCategory,
          targetLevel: targetLevel as SkillLevel,
          currentLevel: normalizedCurrentLevel,
          status: SkillMasteryStatus.ACTIVE,
          roadmapPlan: template.roadmapPlan as Prisma.InputJsonValue,
          overview: template.overview,
          totalWeeks: template.totalWeeks,
          targetDate,
          templateId: template.id,
          careerGoalId: careerGoalId || null,
        },
      });

      await cloneTemplateArtifacts({
        templateId: template.id,
        goalId: goal.id,
        startedAt,
      });

      // Fetch the complete goal with relations
      const completeGoal = await prisma.skillMasteryGoal.findUnique({
        where: { id: goal.id },
        include: {
          tasks: {
            orderBy: [{ phase: "asc" }, { order: "asc" }],
            include: { resources: true },
          },
          resources: true,
          milestones: { orderBy: { targetDate: "asc" } },
          concepts: { orderBy: { order: "asc" } },
        },
      });

      return res.status(201).json({
        goal: completeGoal,
        message: "Skill mastery roadmap created from template.",
        fromTemplate: true,
      });
    }

    // No template found - return error (users can only use pre-generated skills)
    return res.status(400).json({
      error: "Skill roadmap not available",
      message: `No pre-generated roadmap available for "${skillName.trim()}" at ${targetLevel} level${normalizedIncludeCertification ? " with certification" : ""}. Please select from available skills.`,
      availableSkillsEndpoint: "/api/v1/skill-mastery/available-skills",
    });
  } catch (error: any) {
    console.error("Create skill mastery goal error:", error);
    
    // Refund credits if generation failed
    if (creditTransactionId && req.user?.id) {
      try {
        await CreditService.refundCredits(
          req.user.id,
          Feature.SKILL_MASTERY_ROADMAP,
          "Skill mastery roadmap creation failed",
          { error: error.message, skillName: req.body.skillName }
        );
        console.log(`[Skill Mastery] Refunded credits due to creation failure`);
      } catch (refundError) {
        console.error("[Skill Mastery] Failed to refund credits:", refundError);
      }
    }
    
    return res.status(500).json({ error: "Failed to create skill mastery goal" });
  }
};

export const listSkillMasteryGoals = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, skillCategory } = req.query;

    const statusFilter =
      typeof status === "string" && isValidEnumValue(SkillMasteryStatus, status)
        ? (status as SkillMasteryStatus)
        : undefined;

    const goals = await prisma.skillMasteryGoal.findMany({
      where: {
        userId: req.user.id,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(skillCategory
          ? { skillCategory: skillCategory as string }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });

    return res.json({ goals });
  } catch (error: any) {
    console.error("List skill mastery goals error:", error);
    return res.status(500).json({ error: "Failed to list skill mastery goals" });
  }
};

export const getSkillMasteryGoal = async (
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

    const goal = await prisma.skillMasteryGoal.findFirst({
      where: { id: goalId, userId: req.user.id },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        tasks: {
          orderBy: [{ phase: "asc" }, { order: "asc" }],
        },
        resources: true,
        milestones: {
          orderBy: { targetDate: "asc" },
        },
        concepts: {
          orderBy: { order: "asc" },
        },
        quizzes: {
          include: {
            attempts: {
              orderBy: { completedAt: "desc" },
              take: 1,
            },
          },
          orderBy: { phase: "asc" },
        },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Skill mastery goal not found" });
    }

    if (!goal.skillId) {
      return res.status(500).json({ error: "Goal missing skill reference" });
    }

    // Get available quiz templates for this skill (even if user hasn't created quiz instances)
    // Try skillId first, fallback to skillName during migration
    const availableQuizTemplates = await prisma.skillMasteryQuizTemplate.findMany({
      where: {
        OR: [
          { skillId: goal.skillId, isActive: true },
          ...(goal.skillName ? [{ skillName: goal.skillName, isActive: true }] : []),
        ],
      },
      select: {
        id: true,
        phase: true,
        title: true,
        description: true,
        difficulty: true,
        questions: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { phase: "asc" },
    });

    // Create a map of phase -> user quiz instance
    const userQuizzesByPhase = new Map(
      goal.quizzes.map((q) => [q.phase, q]),
    );

    // Combine templates with user quiz instances
    const quizzesByPhase = availableQuizTemplates.map((template) => {
      const userQuiz = userQuizzesByPhase.get(template.phase);
      return {
        phase: template.phase,
        title: template.title,
        description: template.description,
        difficulty: template.difficulty,
        totalQuestions: template.questions.length,
        isAvailable: true,
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
      };
    });

    return res.json({
      goal: {
        ...goal,
        quizzesByPhase, // Add available quizzes organized by phase
      },
    });
  } catch (error: any) {
    console.error("Get skill mastery goal error:", error);
    return res.status(500).json({ error: "Failed to fetch skill mastery goal" });
  }
};

export const updateSkillMasteryTaskStatus = async (
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

    const task = await prisma.skillMasteryTask.findFirst({
      where: { id: taskId, goalId, goal: { userId: req.user.id } },
    });

    if (!task) {
      return res.status(404).json({ error: "Skill mastery task not found" });
    }

    const updatedTask = await prisma.skillMasteryTask.update({
      where: { id: task.id },
      data: {
        status,
        completedAt: status === TaskStatus.COMPLETED ? new Date() : null,
      },
    });

    const updatedGoal = await recomputeSkillMasteryProgress(goalId);

    return res.json({
      task: updatedTask,
      goal: updatedGoal,
    });
  } catch (error: any) {
    console.error("Update skill mastery task status error:", error);
    return res.status(500).json({ error: "Failed to update task status" });
  }
};

export const cancelSkillMasteryGeneration = async (
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

    const goal = await prisma.skillMasteryGoal.findFirst({
      where: { id: goalId, userId: req.user.id },
      select: { id: true, status: true },
    });

    if (!goal) {
      return res.status(404).json({ error: "Skill mastery goal not found" });
    }

    if (goal.status !== SkillMasteryStatus.GENERATING) {
      return res.status(400).json({
        error: "Roadmap generation is not in progress",
        currentStatus: goal.status,
      });
    }

    const cancelled = cancelJob(goalId);

    if (!cancelled) {
      const currentGoal = await prisma.skillMasteryGoal.findUnique({
        where: { id: goalId },
        select: { status: true },
      });

      if (currentGoal?.status !== SkillMasteryStatus.GENERATING) {
        return res.status(400).json({
          error: "Roadmap generation is not in progress",
          currentStatus: currentGoal?.status,
        });
      }
    }

    await prisma.skillMasteryGoal.update({
      where: { id: goalId },
      data: { status: SkillMasteryStatus.CANCELLED },
    });

    return res.json({
      message: "Skill mastery roadmap generation cancelled successfully",
      goalId,
    });
  } catch (error: any) {
    console.error("Cancel skill mastery generation error:", error);
    return res
      .status(500)
      .json({ error: "Failed to cancel skill mastery roadmap generation" });
  }
};

export const deleteSkillMasteryGoal = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { goalId } = req.params;

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
        tasks: {
          select: { id: true },
        },
        resources: {
          select: { id: true },
        },
        milestones: {
          select: { id: true },
        },
        concepts: {
          select: { id: true },
        },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Skill mastery goal not found" });
    }

    await prisma.$transaction([
      prisma.skillMasteryResource.deleteMany({
        where: { goalId: goal.id },
      }),
      prisma.skillMasteryTask.deleteMany({
        where: { goalId: goal.id },
      }),
      prisma.skillMasteryMilestone.deleteMany({
        where: { goalId: goal.id },
      }),
      prisma.skillConcept.deleteMany({
        where: { goalId: goal.id },
      }),
      prisma.skillMasteryGoal.delete({
        where: { id: goal.id },
      }),
    ]);

    // Get skill name for response
    const skillName = goal.skill?.name || goal.skillName || "Unknown";

    return res.json({
      message: "Skill mastery goal deleted successfully",
      deletedGoalId: goal.id,
      deletedSkillName: skillName,
      deletedTasksCount: goal.tasks.length,
      deletedResourcesCount: goal.resources.length,
      deletedMilestonesCount: goal.milestones.length,
      deletedConceptsCount: goal.concepts.length,
    });
  } catch (error: any) {
    console.error("Delete skill mastery goal error:", error);
    return res.status(500).json({ error: "Failed to delete skill mastery goal" });
  }
};

/**
 * Get list of available pre-generated skill roadmaps
 * Public endpoint - no authentication required
 */
export const getAvailableSkills = async (req: Request, res: Response) => {
  try {
    const templates = await prisma.skillMasteryTemplate.findMany({
      where: { isActive: true },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: [
        { skillCategory: "asc" },
        { targetLevel: "asc" },
      ],
    });

    // Group by skill name
    const skillsMap = new Map<
      string,
      {
        name: string;
        category: string | null;
        availableLevels: Array<{
          level: string;
          includeCertification: boolean;
          totalWeeks: number;
          overview: string;
        }>;
      }
    >();

    for (const template of templates) {
      // Use skill.name if available, fallback to skillName during migration
      const skillName = template.skill?.name || template.skillName || "Unknown";
      const skillCategory = template.skill?.category || template.skillCategory;
      
      if (!skillsMap.has(skillName)) {
        skillsMap.set(skillName, {
          name: skillName,
          category: skillCategory || null,
          availableLevels: [],
        });
      }

      const skill = skillsMap.get(skillName)!;
      skill.availableLevels.push({
        level: template.targetLevel,
        includeCertification: template.includeCertification,
        totalWeeks: template.totalWeeks,
        overview: template.overview,
      });
    }

    // Convert to array and get unique categories
    const skills = Array.from(skillsMap.values());
    const categories = Array.from(
      new Set(skills.map((s) => s.category).filter((c): c is string => c !== null)),
    ).sort();

    return res.json({
      skills,
      categories,
      total: skills.length,
    });
  } catch (error: any) {
    console.error("Get available skills error:", error);
    return res.status(500).json({ error: "Failed to get available skills" });
  }
};

