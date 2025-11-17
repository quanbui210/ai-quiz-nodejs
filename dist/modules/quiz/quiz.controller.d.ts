import { Request, Response } from "express";
export declare const listQuizzes: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const suggestQuizTopic: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const validateQuizTopic: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const testCreateQuiz: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createQuiz: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getQuiz: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const submitAnswers: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const pauseQuiz: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const resumeQuiz: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteQuiz: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=quiz.controller.d.ts.map