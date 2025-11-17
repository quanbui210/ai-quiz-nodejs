import { Request, Response, NextFunction } from "express";
export declare const authenticate: (
  req: Request & {
    user?: any;
  },
  res: Response,
  next: NextFunction,
) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.middleware.d.ts.map
