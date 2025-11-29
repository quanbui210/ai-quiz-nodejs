import { Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";

/**
 * Save onboarding data
 * POST /api/v1/user/onboarding
 */
export const saveOnboarding = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      currentPosition,
      targetRole,
      currentSkills,
      resumeId,
      yearsOfExperience,
      industry,
      skip,
    } = req.body;

    // If skip is true, just mark onboarding as completed without saving data
    if (skip === true) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          hasCompletedOnboarding: true,
        },
      });

      return res.json({
        message: "Onboarding skipped",
        hasCompletedOnboarding: true,
      });
    }

    // Validate resume if provided
    if (resumeId) {
      const resume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId: req.user.id,
        },
      });

      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }
    }

    // Normalize skills array
    let normalizedSkills: string[] = [];
    if (Array.isArray(currentSkills)) {
      normalizedSkills = currentSkills
        .map((skill: unknown) => (typeof skill === "string" ? skill.trim() : null))
        .filter((skill): skill is string => Boolean(skill && skill.length > 0));
    }

    // Update user with onboarding data
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        hasCompletedOnboarding: true,
        currentPosition: currentPosition
          ? String(currentPosition).trim()
          : null,
        targetRole: targetRole ? String(targetRole).trim() : null,
        currentSkills: normalizedSkills,
        onboardingResumeId: resumeId || null,
        yearsOfExperience:
          yearsOfExperience !== undefined && yearsOfExperience !== null
            ? Number(yearsOfExperience)
            : null,
        industry: industry ? String(industry).trim() : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        hasCompletedOnboarding: true,
        currentPosition: true,
        targetRole: true,
        currentSkills: true,
        onboardingResumeId: true,
        yearsOfExperience: true,
        industry: true,
      },
    });

    return res.json({
      message: "Onboarding data saved successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Save onboarding error:", error);
    return res.status(500).json({ error: "Failed to save onboarding data" });
  }
};

/**
 * Get user profile data for prefilling forms
 * GET /api/v1/user/profile
 */
export const getUserProfile = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        hasCompletedOnboarding: true,
        currentPosition: true,
        targetRole: true,
        currentSkills: true,
        onboardingResumeId: true,
        yearsOfExperience: true,
        industry: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get resume details if onboardingResumeId exists
    let resume = null;
    if (user.onboardingResumeId) {
      resume = await prisma.resume.findUnique({
        where: { id: user.onboardingResumeId },
        select: {
          id: true,
          title: true,
          filename: true,
          status: true,
        },
      });
    }

    return res.json({
      profile: {
        ...user,
        resume,
      },
    });
  } catch (error: any) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ error: "Failed to get user profile" });
  }
};

/**
 * Update user profile (for editing after onboarding)
 * PUT /api/v1/user/profile
 */
export const updateUserProfile = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      currentPosition,
      targetRole,
      currentSkills,
      resumeId,
      yearsOfExperience,
      industry,
    } = req.body;

    // Validate resume if provided
    if (resumeId) {
      const resume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId: req.user.id,
        },
      });

      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }
    }

    // Normalize skills array
    let normalizedSkills: string[] = [];
    if (Array.isArray(currentSkills)) {
      normalizedSkills = currentSkills
        .map((skill: unknown) => (typeof skill === "string" ? skill.trim() : null))
        .filter((skill): skill is string => Boolean(skill && skill.length > 0));
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        currentPosition: currentPosition !== undefined
          ? (currentPosition ? String(currentPosition).trim() : null)
          : undefined,
        targetRole: targetRole !== undefined
          ? (targetRole ? String(targetRole).trim() : null)
          : undefined,
        currentSkills: currentSkills !== undefined ? normalizedSkills : undefined,
        onboardingResumeId: resumeId !== undefined ? (resumeId || null) : undefined,
        yearsOfExperience:
          yearsOfExperience !== undefined
            ? (yearsOfExperience !== null ? Number(yearsOfExperience) : null)
            : undefined,
        industry: industry !== undefined
          ? (industry ? String(industry).trim() : null)
          : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        hasCompletedOnboarding: true,
        currentPosition: true,
        targetRole: true,
        currentSkills: true,
        onboardingResumeId: true,
        yearsOfExperience: true,
        industry: true,
      },
    });

    return res.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Update user profile error:", error);
    return res.status(500).json({ error: "Failed to update user profile" });
  }
};

