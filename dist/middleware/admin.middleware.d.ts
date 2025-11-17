import { Request, Response, NextFunction } from "express";
import { AdminRole } from "@prisma/client";
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
    admin?: {
        id: string;
        userId: string;
        role: AdminRole;
        permissions: string[];
    };
}
export declare const requireAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const requireSuperAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const requirePermission: (permission: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=admin.middleware.d.ts.map