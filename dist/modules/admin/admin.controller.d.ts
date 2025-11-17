import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/admin.middleware";
export declare const getDashboard: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const listUsers: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getUser: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const updateUserLimits: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const changeUserSubscription: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const makeAdmin: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const revokeAdmin: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const listPlans: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const createPlan: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const updatePlan: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const deletePlan: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=admin.controller.d.ts.map
