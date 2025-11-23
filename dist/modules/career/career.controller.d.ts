import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
export declare const createCareerGoal: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listCareerGoals: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getCareerGoal: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateCareerTaskStatus: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const regenerateCareerRoadmap: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const suggestCareerQuizTopics: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const exportCareerRoadmapPDF: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const deleteCareerGoal: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=career.controller.d.ts.map