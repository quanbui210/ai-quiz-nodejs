import { Request, Response, NextFunction } from "express";
import prisma from "../utils/prisma";
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

export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const adminProfile = await prisma.adminUser.findUnique({
      where: { userId: req.user.id },
    });

    if (!adminProfile) {
      return res.status(403).json({
        error: "Admin access required",
        message: "You do not have permission to access this resource",
      });
    }

    req.admin = adminProfile;
    return next();
  } catch (error: any) {
    console.error("Admin check error:", error);
    return res.status(500).json({ error: "Failed to verify admin access" });
  }
};

export const requireSuperAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const adminProfile = await prisma.adminUser.findUnique({
      where: { userId: req.user.id },
    });

    if (!adminProfile) {
      return res.status(403).json({
        error: "Admin access required",
        message: "You do not have permission to access this resource",
      });
    }

    if (adminProfile.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Super admin access required",
        message: "This action requires super admin privileges",
      });
    }

    req.admin = adminProfile;
    return next();
  } catch (error: any) {
    console.error("Super admin check error:", error);
    return res
      .status(500)
      .json({ error: "Failed to verify super admin access" });
  }
};

export const requirePermission = (permission: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      if (req.admin.role === "SUPER_ADMIN") {
        return next();
      }

      if (!req.admin.permissions.includes(permission)) {
        return res.status(403).json({
          error: "Permission denied",
          requiredPermission: permission,
          message: `You do not have the required permission: ${permission}`,
        });
      }

      return next();
    } catch (error: any) {
      console.error("Permission check error:", error);
      return res.status(500).json({ error: "Failed to verify permission" });
    }
  };
};
