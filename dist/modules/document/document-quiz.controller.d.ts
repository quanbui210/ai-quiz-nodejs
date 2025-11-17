import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
export declare const getDocumentQuizzes: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const generateQuizFromDocument: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=document-quiz.controller.d.ts.map
