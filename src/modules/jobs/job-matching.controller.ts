import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import prisma from "../../utils/prisma";
import {
  matchJobsToUser,
  getUserCVEmbedding,
  generateCVEmbeddingIfNeeded,
} from "./job-matching.service";

/**
 * GET /api/jobs/match
 * 
 * Match user's CV to available jobs using vector search
 */
export const matchJobs = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      location,
      role,
      limit = 20,
      minMatchScore = 5,
    } = req.query;

    // Get user's resume
    // @ts-ignore - Prisma client will be regenerated after schema migration
    const resume = await (prisma as any).resume.findFirst({
      where: {
        userId: req.user.id,
        status: "READY",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!resume || !resume.parsedText) {
      return res.status(404).json({
        error: "No resume found",
        message: "Please upload a resume first to match jobs.",
      });
    }

    // Get or generate CV embedding
    let cvEmbedding = await getUserCVEmbedding(req.user.id);
    if (!cvEmbedding) {
      console.log("[Job Matching] Generating CV embedding...");
      cvEmbedding = await generateCVEmbeddingIfNeeded(
        req.user.id,
        resume.parsedText,
      );
    }

    // Get user skills from resume or profile
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        currentSkills: true,
        yearsOfExperience: true,
        industry: true,
      },
    });

    const userSkills = resume.extractedSkills?.length > 0
      ? resume.extractedSkills
      : user?.currentSkills || [];

    // Match jobs
    const matches = await matchJobsToUser({
      userId: req.user.id,
      cvEmbedding,
      userSkills,
      userExperienceYears: resume.yearsOfExperience || user?.yearsOfExperience || undefined,
      userEducationLevel: resume.educationLevel || undefined,
      userLanguages: ["Finnish", "English"], // Default for Finland, can be enhanced
      location: typeof location === "string" ? location : undefined,
      role: typeof role === "string" ? role : undefined,
      limit: typeof limit === "string" ? parseInt(limit, 10) : 20,
      minMatchScore: typeof minMatchScore === "string" ? parseInt(minMatchScore, 10) : 20, // Lower default threshold for more matches
    });

    return res.json({
      matches,
      total: matches.length,
      userProfile: {
        skills: userSkills,
        experienceYears: resume.yearsOfExperience || user?.yearsOfExperience,
        educationLevel: resume.educationLevel,
      },
    });
  } catch (error: any) {
    console.error("[Job Matching] Error:", error);
    return res.status(500).json({
      error: "Failed to match jobs",
      message: error?.message || "Internal server error",
    });
  }
};

/**
 * GET /api/jobs/recent
 * 
 * Get recent jobs with full data. If user has CV, includes match scores and analysis.
 * Jobs are sorted by match score (matched first), then by posted date.
 */
export const getRecentJobs = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      location,
      role,
      limit = 30,
    } = req.query;

    const whereClause: any = {};

    if (location && typeof location === "string") {
      whereClause.location = {
        contains: location,
        mode: "insensitive",
      };
    }

    if (role && typeof role === "string") {
      whereClause.role = {
        contains: role,
        mode: "insensitive",
      };
    }

    // Get all recent jobs with full data
    // @ts-ignore - Prisma client will be regenerated after schema migration
    const jobs = await (prisma as any).job.findMany({
      where: whereClause,
      include: {
        analysis: true, // Include full analysis
      },
      orderBy: {
        postedDate: "desc",
      },
      take: typeof limit === "string" ? parseInt(limit, 10) : 30,
    });

    // Check if user has CV for matching
    // @ts-ignore
    const resume = await (prisma as any).resume.findFirst({
      where: {
        userId: req.user.id,
        status: "READY",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    let matchData: Map<string, any> = new Map();
    let userProfile: any = null;

    // If user has CV, calculate match scores for all jobs
    if (resume && resume.parsedText) {
      try {
        // Get or generate CV embedding
        let cvEmbedding = await getUserCVEmbedding(req.user.id);
        if (!cvEmbedding) {
          console.log("[Recent Jobs] Generating CV embedding for matching...");
          cvEmbedding = await generateCVEmbeddingIfNeeded(
            req.user.id,
            resume.parsedText,
          );
        }

        // Get user profile data
        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: {
            currentSkills: true,
            yearsOfExperience: true,
            industry: true,
          },
        });

        const userSkills = resume.extractedSkills?.length > 0
          ? resume.extractedSkills
          : user?.currentSkills || [];

        userProfile = {
          skills: userSkills,
          experienceYears: resume.yearsOfExperience || user?.yearsOfExperience,
          educationLevel: resume.educationLevel,
        };

        // Match all jobs (with lower threshold to get more matches)
        if (cvEmbedding) {
          const matches = await matchJobsToUser({
            userId: req.user.id,
            cvEmbedding,
            userSkills,
            userExperienceYears: resume.yearsOfExperience || user?.yearsOfExperience || undefined,
            userEducationLevel: resume.educationLevel || undefined,
            userLanguages: ["Finnish", "English"],
            location: typeof location === "string" ? location : undefined,
            role: typeof role === "string" ? role : undefined,
            limit: 100, // Get matches for all jobs
            minMatchScore: 0, // No minimum - include all matches for sorting
          });

          // Create map of jobId -> match data
          for (const match of matches) {
            matchData.set(match.job.id, {
              matchScore: match.matchScore,
              skillMatch: match.skillMatch,
              experienceMatch: match.experienceMatch,
              educationMatch: match.educationMatch,
              languageMatch: match.languageMatch,
              matchExplanation: match.matchExplanation,
            });
          }
        }
      } catch (error) {
        console.error("[Recent Jobs] Failed to calculate matches:", error);
        // Continue without matching - just return jobs without match data
      }
    }

    // Format jobs with full data and match info
    const jobsWithMatches = jobs.map((job: any) => {
      const match = matchData.get(job.id);
      const baseJob = {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        postedDate: job.postedDate,
        scrapedAt: job.scrapedAt,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        jobType: job.jobType || [],
        experienceLevel: job.experienceLevel,
        role: job.role,
        // Full job description
        description: job.descriptionRaw,
        // Analysis data
        analysis: job.analysis ? {
          mustHaveSkills: job.analysis.mustHaveSkills || [],
          niceToHaveSkills: job.analysis.niceToHaveSkills || [],
          experienceYears: job.analysis.experienceYears,
          educationLevel: job.analysis.educationLevel,
          languageRequirements: job.analysis.languageRequirements || [],
        } : null,
      };

      // Add match data if available
      if (match) {
        return {
          ...baseJob,
          matchScore: match.matchScore,
          skillMatch: match.skillMatch,
          experienceMatch: match.experienceMatch,
          educationMatch: match.educationMatch,
          languageMatch: match.languageMatch,
          matchExplanation: match.matchExplanation,
          isMatched: true,
        };
      }

      return {
        ...baseJob,
        matchScore: null,
        isMatched: false,
      };
    });

    // Sort: matched jobs first (by match score), then unmatched (by posted date)
    jobsWithMatches.sort((a: any, b: any) => {
      if (a.isMatched && !b.isMatched) return -1;
      if (!a.isMatched && b.isMatched) return 1;
      if (a.isMatched && b.isMatched) {
        return (b.matchScore || 0) - (a.matchScore || 0);
      }
      // Both unmatched, sort by posted date
      const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
      const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
      return dateB - dateA;
    });

    return res.json({
      jobs: jobsWithMatches,
      total: jobsWithMatches.length,
      hasMatches: matchData.size > 0,
      userProfile: userProfile, // Include user profile if CV exists
    });
  } catch (error: any) {
    console.error("[Recent Jobs] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch recent jobs",
      message: error?.message || "Internal server error",
    });
  }
};

