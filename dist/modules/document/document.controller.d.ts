import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
export declare const uploadDocument: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const listDocuments: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getDocument: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const deleteDocument: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=document.controller.d.ts.map
