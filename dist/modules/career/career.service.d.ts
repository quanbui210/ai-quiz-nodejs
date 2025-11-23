import { Difficulty, ResourceType, TaskType, Timeframe } from "@prisma/client";
export interface SkillGapAnalysisInput {
    currentRole: string;
    targetRole: string;
    currentSkills: string[];
    timeframe: Timeframe;
    resumeText?: string | null;
}
export interface SkillGapAnalysis {
    requiredSkills: string[];
    skillGapAnalysis: Array<{
        skill: string;
        currentLevel: number;
        requiredLevel: number;
        gap: number;
        priority: "HIGH" | "MEDIUM" | "LOW";
    }>;
}
export declare const generateSkillGapAnalysis: (input: SkillGapAnalysisInput) => Promise<SkillGapAnalysis>;
export interface RoadmapResource {
    title: string;
    url?: string;
    resourceType: ResourceType;
    description?: string;
    estimatedHours?: number;
    difficulty?: Difficulty;
}
export interface RoadmapTask {
    title: string;
    description?: string;
    type: TaskType;
    estimatedHours?: number;
    dueInWeeks?: number;
    resources?: RoadmapResource[];
}
export interface RoadmapPhase {
    phase: number;
    title: string;
    durationWeeks: number;
    focus: string;
    tasks: RoadmapTask[];
    milestone?: {
        title: string;
        dueInWeeks: number;
        description?: string;
    };
}
export interface RoadmapPlan {
    overview: string;
    totalWeeks: number;
    phases: RoadmapPhase[];
}
export interface RoadmapInput {
    currentRole: string;
    targetRole: string;
    timeframe: Timeframe;
    currentSkills: string[];
    analysis: SkillGapAnalysis;
    resumeText?: string | null;
    existingProgress?: {
        completedSkills?: string[];
        blockedAreas?: string[];
    };
}
export declare const generateRoadmapPlan: (input: RoadmapInput) => Promise<RoadmapPlan>;
export interface QuizSuggestion {
    skill: string;
    suggestedQuizTitle: string;
    difficulty: Difficulty;
    reason: string;
    linkedTaskTitle?: string;
}
export declare const suggestQuizTopicsFromRoadmap: (input: {
    targetRole: string;
    currentRole: string;
    pendingTasks: Array<{
        title: string;
        description?: string;
    }>;
}) => Promise<QuizSuggestion[]>;
//# sourceMappingURL=career.service.d.ts.map