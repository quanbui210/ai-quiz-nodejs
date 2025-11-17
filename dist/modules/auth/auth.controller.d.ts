import { Request, Response } from "express";
export declare const loginWithGoogle: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const handleCallback: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getSession: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const signOut: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const loginWithEmail: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getCurrentUser: (
  req: Request & {
    user?: any;
  },
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.controller.d.ts.map
