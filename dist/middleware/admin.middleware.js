"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission =
  exports.requireSuperAdmin =
  exports.requireAdmin =
    void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const adminProfile = await prisma_1.default.adminUser.findUnique({
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
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({ error: "Failed to verify admin access" });
  }
};
exports.requireAdmin = requireAdmin;
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const adminProfile = await prisma_1.default.adminUser.findUnique({
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
  } catch (error) {
    console.error("Super admin check error:", error);
    return res
      .status(500)
      .json({ error: "Failed to verify super admin access" });
  }
};
exports.requireSuperAdmin = requireSuperAdmin;
const requirePermission = (permission) => {
  return async (req, res, next) => {
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
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({ error: "Failed to verify permission" });
    }
  };
};
exports.requirePermission = requirePermission;
//# sourceMappingURL=admin.middleware.js.map
