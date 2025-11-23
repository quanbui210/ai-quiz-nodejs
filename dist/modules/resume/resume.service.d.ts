export interface ResumeAnalysisInput {
    resumeText: string;
    targetRole?: string;
    yearsOfExperience?: number;
}
export interface ResumeAnalysis {
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: {
        content: string[];
        formatting: string[];
        keywords: string[];
        atsOptimization: string[];
    };
    summary: string;
}
export declare const analyzeResume: (input: ResumeAnalysisInput) => Promise<ResumeAnalysis>;
//# sourceMappingURL=resume.service.d.ts.map