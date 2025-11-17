import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
export declare const getPlans: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getMySubscription: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const createCheckoutSession: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const handleWebhook: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const cancelSubscription: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const resumeSubscription: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getCustomerPortal: (
  req: AuthenticatedRequest,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=subscription.controller.d.ts.map
