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

    let cvEmbedding = await getUserCVEmbedding(req.user.id);
    if (!cvEmbedding) {
      console.log("[Job Matching] Generating CV embedding...");
      cvEmbedding = await generateCVEmbeddingIfNeeded(
        req.user.id,
        resume.parsedText,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        currentSkills: true,
        yearsOfExperience: true,
        industry: true,
        currentPosition: true, 
      },
    });

    const userSkills = resume.extractedSkills?.length > 0
      ? resume.extractedSkills
      : user?.currentSkills || [];

    if (!resume.parsedText || resume.parsedText.trim().length === 0) {
    } else {
      console.log(`[Job Matching] CV text available (${resume.parsedText.length} chars)`);
    }

    const matches = await matchJobsToUser({
      userId: req.user.id,
      cvEmbedding: cvEmbedding || [],
      cvText: resume.parsedText && resume.parsedText.trim().length > 0 ? resume.parsedText : undefined,
      userSkills,
      userExperienceYears: resume.yearsOfExperience || user?.yearsOfExperience || undefined,
      userEducationLevel: resume.educationLevel || undefined,
      userLanguages: ["Finnish", "English"],
      userCurrentPosition: user?.currentPosition || undefined,
      location: typeof location === "string" ? location : undefined,
      role: typeof role === "string" ? role : undefined,
      limit: typeof limit === "string" ? parseInt(limit, 10) : 20,
      minMatchScore: typeof minMatchScore === "string" ? parseInt(minMatchScore, 10) : 20,
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


export const getRecentJobs = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const defaultLimit = 100;
    const {
      location,
      role,
      limit = defaultLimit,
    } = req.query;
    
    const finalLimit = typeof limit === "string" ? parseInt(limit, 10) : defaultLimit;
    console.log(`[Recent Jobs] Limit: ${finalLimit} (default: ${defaultLimit}, env: ${process.env.JOB_LISTING_LIMIT || "not set"})`);

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

    const jobs = await (prisma as any).job.findMany({
      where: whereClause,
      include: {
        analysis: true,
      },
      orderBy: {
        postedDate: "desc",
      },
      take: 100,
    });

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
    let requiresResume = false;

    if (!resume || !resume.parsedText || resume.parsedText.trim().length === 0) {
      requiresResume = true;
      console.log("[Recent Jobs] No resume found or resume has no parsed text - skipping job matching");
    } else if (resume && resume.parsedText) {
      try {
        let cvEmbedding = await getUserCVEmbedding(req.user.id);
        if (!cvEmbedding) {
          console.log("[Recent Jobs] Generating CV embedding for matching...");
          cvEmbedding = await generateCVEmbeddingIfNeeded(
            req.user.id,
            resume.parsedText,
          );
        }

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: {
            currentSkills: true,
            yearsOfExperience: true,
            industry: true,
            currentPosition: true, 
          },
        });

        const userSkills = resume.extractedSkills?.length > 0
          ? resume.extractedSkills
          : user?.currentSkills || [];

        userProfile = {
          skills: userSkills,
          experienceYears: resume.yearsOfExperience || user?.yearsOfExperience,
          educationLevel: resume.educationLevel,
          currentPosition: user?.currentPosition,
        };

        if (cvEmbedding) {
          if (!resume.parsedText || resume.parsedText.trim().length === 0) {
            console.log("[Recent Jobs]  Warning: resume.parsedText is missing or empty");
          } else {
            console.log(`[Recent Jobs]  CV text available (${resume.parsedText.length} chars)`);
          }

          const matches = await matchJobsToUser({
            userId: req.user.id,
            cvEmbedding,
            cvText: resume.parsedText && resume.parsedText.trim().length > 0 ? resume.parsedText : undefined,
            userSkills,
            userExperienceYears: resume.yearsOfExperience || user?.yearsOfExperience || undefined,
            userEducationLevel: resume.educationLevel || undefined,
            userLanguages: ["Finnish", "English"],
            userCurrentPosition: user?.currentPosition || undefined,
            location: typeof location === "string" ? location : undefined,
            role: typeof role === "string" ? role : undefined,
            limit: 100, 
            minMatchScore: 0, 
          });

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
      }
    }

    const jobsWithMatches = jobs.map((job: any) => {
      const match = matchData.get(job.id);
      const baseJob = {
        id: job.id,
        title: job.title,
        company: job.company,
        companyLogoUrl: job.companyLogoUrl || null,
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
        description: job.descriptionRaw,
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

    jobsWithMatches.sort((a: any, b: any) => {
      if (a.isMatched && !b.isMatched) return -1;
      if (!a.isMatched && b.isMatched) return 1;
      if (a.isMatched && b.isMatched) {
        return (b.matchScore || 0) - (a.matchScore || 0);
      }
      const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
      const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
      return dateB - dateA;
    });

    return res.json({
      jobs: jobsWithMatches,
      total: jobsWithMatches.length,
      hasMatches: matchData.size > 0,
      requiresResume: requiresResume,
      userProfile: userProfile,
    });
  } catch (error: any) {
    console.error("[Recent Jobs] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch recent jobs",
      message: error?.message || "Internal server error",
    });
  }
};

