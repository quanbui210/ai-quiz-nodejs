import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
export declare const getDocumentChatSessions: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=document-chat.controller.d.ts.map
