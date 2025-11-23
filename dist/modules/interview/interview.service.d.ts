import { InterviewLevel, QuestionCategory } from "@prisma/client";
export interface GenerateQuestionInput {
    role: string;
    roleDescription?: string | null;
    level: InterviewLevel;
    yearsOfExperience?: number | null;
    country?: string | null;
    industry?: string | null;
    previousQuestions?: string[];
    preferredCategory?: QuestionCategory;
    resumeHighlights?: string[];
}
export interface GeneratedQuestion {
    question: string;
    category: QuestionCategory;
    rationale?: string;
    followUp?: string[];
}
export interface EvaluateAnswerInput {
    role: string;
    level: InterviewLevel;
    question: string;
    category: QuestionCategory;
    answer: string;
    resumeHighlights?: string[];
}
export interface EvaluatedAnswer {
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    improvementTips?: string;
    starFormatScore?: {
        situation: number;
        task: number;
        action: number;
        result: number;
    };
}
export declare const generateInterviewQuestion: (input: GenerateQuestionInput) => Promise<GeneratedQuestion>;
export declare const evaluateInterviewAnswer: (input: EvaluateAnswerInput) => Promise<EvaluatedAnswer>;
export interface SessionSummaryInput {
    role: string;
    level: InterviewLevel;
    answers: Array<{
        question: string;
        answer: string;
        score?: number | null;
        strengths?: string[];
        weaknesses?: string[];
    }>;
}
export interface SessionSummary {
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
}
export declare const summarizeInterviewSession: (input: SessionSummaryInput) => Promise<SessionSummary>;
//# sourceMappingURL=interview.service.d.ts.map