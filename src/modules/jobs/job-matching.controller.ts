import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import prisma from "../../utils/prisma";
import {
  matchJobsToUser,
  getUserCVEmbedding,
  generateCVEmbeddingIfNeeded,
  analyzeJobMatchWithLLM,
} from "./job-matching.service";
import { processJobWithAI } from "./job-processor.service";
import { CreditService, Feature } from "../../services/credit.service";
import crypto from "crypto";

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
      take: finalLimit,
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

    const jobsList = jobs.map((job: any) => ({
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
      canMatch: !!resume && !!resume.parsedText,
    }));

    jobsList.sort((a: any, b: any) => {
      const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
      const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
      return dateB - dateA;
    });

    return res.json({
      jobs: jobsList,
      total: jobsList.length,
      hasResume: !!resume && !!resume.parsedText,
      requiresResume: !resume || !resume.parsedText,
    });
  } catch (error: any) {
    console.error("[Recent Jobs] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch recent jobs",
      message: error?.message || "Internal server error",
    });
  }
};

export const matchSingleJob = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  let creditTransactionId: string | undefined;
  
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

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

    const cacheCutoff = new Date();
    cacheCutoff.setDate(cacheCutoff.getDate() - 7);

    const cachedMatch = await (prisma as any).userJobMatch.findUnique({
      where: {
        userId_jobId: {
          userId: req.user.id,
          jobId: jobId,
        },
      },
      include: {
        jobAnalysis: {
          include: {
            job: {
              include: {
                analysis: true,
              },
            },
          },
        },
      },
    });

    if (cachedMatch && cachedMatch.calculatedAt >= cacheCutoff) {
      return res.json({
        match: {
          job: {
            id: cachedMatch.jobAnalysis.job.id,
            title: cachedMatch.jobAnalysis.job.title,
            company: cachedMatch.jobAnalysis.job.company,
            companyLogoUrl: cachedMatch.jobAnalysis.job.companyLogoUrl || null,
            location: cachedMatch.jobAnalysis.job.location,
            url: cachedMatch.jobAnalysis.job.url,
            postedDate: cachedMatch.jobAnalysis.job.postedDate,
            salaryMin: cachedMatch.jobAnalysis.job.salaryMin,
            salaryMax: cachedMatch.jobAnalysis.job.salaryMax,
            salaryCurrency: cachedMatch.jobAnalysis.job.salaryCurrency,
          },
          analysis: {
            mustHaveSkills: cachedMatch.jobAnalysis.mustHaveSkills || [],
            niceToHaveSkills: cachedMatch.jobAnalysis.niceToHaveSkills || [],
            experienceYears: cachedMatch.jobAnalysis.experienceYears,
            educationLevel: cachedMatch.jobAnalysis.educationLevel,
            languageRequirements: cachedMatch.jobAnalysis.languageRequirements || [],
          },
          matchScore: cachedMatch.matchScore,
          skillMatch: {
            score: cachedMatch.skillMatchScore,
            matchingMustHave: [],
            missingMustHave: [],
            matchingNiceToHave: [],
            missingNiceToHave: [],
          },
          experienceMatch: cachedMatch.experienceMatch,
          educationMatch: cachedMatch.educationMatch,
          languageMatch: cachedMatch.languageMatch,
          matchExplanation: cachedMatch.matchExplanation,
        },
        cached: true,
      });
    }

    const { hasCredits, currentBalance, required } = await CreditService.hasEnoughCredits(
      req.user.id,
      Feature.JOB_MATCHING,
    );

    if (!hasCredits) {
      return res.status(402).json({
        error: "Insufficient credits",
        message: `You need ${required} credits to match a job. Current balance: ${currentBalance}`,
        currentBalance,
        required,
      });
    }

    const { transactionId } = await CreditService.deductCredits(
      req.user.id,
      Feature.JOB_MATCHING,
      { jobId, action: "match_single_job" },
    );
    creditTransactionId = transactionId;

    let job = await (prisma as any).job.findUnique({
      where: { id: jobId },
      include: {
        analysis: true,
      },
    });

    if (!job) {
      if (creditTransactionId) {
        await CreditService.refundCredits(
          req.user.id,
          Feature.JOB_MATCHING,
          "Job not found",
          { jobId, transactionId: creditTransactionId },
        ).catch(console.error);
      }
      return res.status(404).json({
        error: "Job not found",
        message: "The requested job does not exist.",
      });
    }

    // If job exists but hasn't been analyzed yet, analyze it on-demand
    if (!job.analysis) {
      console.log(`[Job Matching] Job ${jobId} not analyzed yet, analyzing on-demand...`);
      try {
        await processJobWithAI(jobId);
        
        // Reload job with analysis
        job = await (prisma as any).job.findUnique({
          where: { id: jobId },
          include: {
            analysis: true,
          },
        });

        if (!job || !job.analysis) {
          if (creditTransactionId) {
            await CreditService.refundCredits(
              req.user.id,
              Feature.JOB_MATCHING,
              "Failed to analyze job",
              { jobId, transactionId: creditTransactionId },
            ).catch(console.error);
          }
          return res.status(500).json({
            error: "Failed to analyze job",
            message: "The job could not be analyzed. Please try again later.",
          });
        }
        
        console.log(`[Job Matching] Job ${jobId} analyzed successfully, proceeding with match...`);
      } catch (analysisError: any) {
        console.error(`[Job Matching] Error analyzing job ${jobId}:`, analysisError);
        if (creditTransactionId) {
          await CreditService.refundCredits(
            req.user.id,
            Feature.JOB_MATCHING,
            "Failed to analyze job",
            { jobId, transactionId: creditTransactionId, error: analysisError.message },
          ).catch(console.error);
        }
        return res.status(500).json({
          error: "Failed to analyze job",
          message: analysisError.message || "The job could not be analyzed. Please try again later.",
        });
      }
    }

        let cvEmbedding = await getUserCVEmbedding(req.user.id);
        if (!cvEmbedding) {
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

    const embeddingString = `[${cvEmbedding.join(",")}]`;
    const similarityResult = await prisma.$queryRawUnsafe<Array<{
      similarity: number;
    }>>(
      `SELECT 1 - (ja."analysisEmbedding" <=> '${embeddingString}'::vector) as similarity
       FROM "JobAnalysis" ja
       WHERE ja."jobId" = '${jobId}'
       LIMIT 1`
    );

    const vectorSimilarity = similarityResult[0]?.similarity || 0;

    const commonSkills = new Set([
      "git", "github", "vite", "npm", "yarn", "agile", "scrum",
      "jira", "confluence", "slack", "docker", "kubernetes", "linux", "unix",
      "rest", "api", "http", "https", "json", "xml", "sql", "nosql"
    ]);

    const filterCommonSkills = (skills: string[]): string[] => {
      return skills.filter(skill => {
        const skillLower = skill.toLowerCase();
        return !commonSkills.has(skillLower) && 
               !skillLower.includes("git") && 
               !skillLower.includes("vite") &&
               !skillLower.includes("npm");
      });
    };

    const filteredMustHave = filterCommonSkills(job.analysis.mustHaveSkills || []);
    const filteredNiceToHave = filterCommonSkills(job.analysis.niceToHaveSkills || []);
    const filteredUserSkills = filterCommonSkills(userSkills);

    const analysis = await analyzeJobMatchWithLLM({
      job: {
        ...job,
        analysis: {
          ...job.analysis,
          mustHaveSkills: filteredMustHave,
          niceToHaveSkills: filteredNiceToHave,
        },
      },
      cvText: resume.parsedText.substring(0, 5000),
      userSkills: filteredUserSkills,
      userExperienceYears: resume.yearsOfExperience || user?.yearsOfExperience,
            userEducationLevel: resume.educationLevel || undefined,
            userLanguages: ["Finnish", "English"],
            userCurrentPosition: user?.currentPosition || undefined,
      vectorSimilarity,
      pageCount: resume.pageCount || undefined,
    });

    if (!analysis.matchExplanation?.ats) {
      console.warn(`[Job Matching] ATS field missing in match analysis for job ${job.id}. This may indicate LLM response issue.`);
    }

    try {
      await (prisma as any).userJobMatch.upsert({
        where: {
          userId_jobId: {
            userId: req.user.id,
            jobId: job.id,
          },
        },
        create: {
          userId: req.user.id,
          jobId: job.id,
          matchScore: analysis.matchScore,
          skillMatchScore: analysis.skillMatch.score,
          titleMatchScore: 50,
          vectorSimilarity,
          experienceMatch: analysis.experienceMatch,
          educationMatch: analysis.educationMatch,
          languageMatch: analysis.languageMatch,
          matchExplanation: analysis.matchExplanation as any,
          calculatedAt: new Date(),
        },
        update: {
          matchScore: analysis.matchScore,
          skillMatchScore: analysis.skillMatch.score,
          vectorSimilarity,
          experienceMatch: analysis.experienceMatch,
          educationMatch: analysis.educationMatch,
          languageMatch: analysis.languageMatch,
          matchExplanation: analysis.matchExplanation as any,
          calculatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (cacheError) {
      console.error("[Job Matching] Failed to cache match:", cacheError);
    }

    const savedMatch = await (prisma as any).userJobMatch.findUnique({
      where: {
        userId_jobId: {
          userId: req.user.id,
          jobId: job.id,
        },
      },
    });

    return res.json({
      match: {
        id: savedMatch?.id,
        job: {
        id: job.id,
        title: job.title,
        company: job.company,
        companyLogoUrl: job.companyLogoUrl || null,
        location: job.location,
        url: job.url,
        postedDate: job.postedDate,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        },
        analysis: {
          mustHaveSkills: job.analysis.mustHaveSkills || [],
          niceToHaveSkills: job.analysis.niceToHaveSkills || [],
          experienceYears: job.analysis.experienceYears,
          educationLevel: job.analysis.educationLevel,
          languageRequirements: job.analysis.languageRequirements || [],
        },
        matchScore: analysis.matchScore,
        skillMatch: analysis.skillMatch,
        experienceMatch: analysis.experienceMatch,
        educationMatch: analysis.educationMatch,
        languageMatch: analysis.languageMatch,
        matchExplanation: analysis.matchExplanation || (savedMatch?.matchExplanation as any) || {
          summary: "Match analysis available.",
          strengths: [],
          gaps: [],
          recommendations: [],
        },
        userNotes: savedMatch?.userNotes || null,
        applicationStatus: savedMatch?.applicationStatus || null,
        appliedAt: savedMatch?.appliedAt ? savedMatch.appliedAt.toISOString() : null,
        interviewDate: savedMatch?.interviewDate ? savedMatch.interviewDate.toISOString() : null,
        outcome: savedMatch?.outcome || null,
        calculatedAt: savedMatch?.calculatedAt ? savedMatch.calculatedAt.toISOString() : new Date().toISOString(),
        matchedAt: savedMatch?.calculatedAt ? savedMatch.calculatedAt.toISOString() : new Date().toISOString(),
      },
      cached: false,
      saved: !!savedMatch,
    });
  } catch (error: any) {
    console.error("[Job Matching] Error:", error);
    
    if (creditTransactionId && req.user?.id) {
      await CreditService.refundCredits(
        req.user.id,
        Feature.JOB_MATCHING,
        "Job matching failed",
        { transactionId: creditTransactionId },
      ).catch(console.error);
    }

    return res.status(500).json({
      error: "Failed to match job",
      message: error?.message || "Internal server error",
    });
  }
};

export const getSavedMatches = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, limit = 50 } = req.query;

    const whereClause: any = {
      userId: req.user.id,
    };

    if (status && typeof status === "string") {
      whereClause.applicationStatus = status;
    }

    const matches = await (prisma as any).userJobMatch.findMany({
      where: whereClause,
      include: {
        jobAnalysis: {
          include: {
            job: true,
          },
        },
      },
      orderBy: {
        calculatedAt: "desc",
      },
      take: typeof limit === "string" ? parseInt(limit, 10) : 50,
    });

    const formattedMatches = matches.map((match: any) => ({
      id: match.id,
      job: {
        id: match.jobAnalysis.job.id,
        title: match.jobAnalysis.job.title,
        company: match.jobAnalysis.job.company,
        companyLogoUrl: match.jobAnalysis.job.companyLogoUrl || null,
        location: match.jobAnalysis.job.location,
        url: match.jobAnalysis.job.url,
        postedDate: match.jobAnalysis.job.postedDate,
        salaryMin: match.jobAnalysis.job.salaryMin,
        salaryMax: match.jobAnalysis.job.salaryMax,
        salaryCurrency: match.jobAnalysis.job.salaryCurrency,
      },
      analysis: {
        mustHaveSkills: match.jobAnalysis.mustHaveSkills || [],
        niceToHaveSkills: match.jobAnalysis.niceToHaveSkills || [],
        experienceYears: match.jobAnalysis.experienceYears,
        educationLevel: match.jobAnalysis.educationLevel,
        languageRequirements: match.jobAnalysis.languageRequirements || [],
      },
          matchScore: match.matchScore,
      skillMatch: {
        score: match.skillMatchScore,
        matchingMustHave: [],
        missingMustHave: [],
        matchingNiceToHave: [],
        missingNiceToHave: [],
      },
          experienceMatch: match.experienceMatch,
          educationMatch: match.educationMatch,
          languageMatch: match.languageMatch,
      matchExplanation: match.matchExplanation || {
        summary: "Match analysis available.",
        strengths: [],
        gaps: [],
        recommendations: [],
      },
      userNotes: match.userNotes || null,
      applicationStatus: match.applicationStatus || null,
      appliedAt: match.appliedAt ? match.appliedAt.toISOString() : null,
      interviewDate: match.interviewDate ? match.interviewDate.toISOString() : null,
      outcome: match.outcome || null,
      calculatedAt: match.calculatedAt.toISOString(),
      matchedAt: match.calculatedAt.toISOString(),
    }));

    return res.json({
      matches: formattedMatches,
      total: formattedMatches.length,
    });
  } catch (error: any) {
    console.error("[Saved Matches] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch saved matches",
      message: error?.message || "Internal server error",
    });
  }
};

export const getSavedMatch = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { matchId } = req.params;

    const match = await (prisma as any).userJobMatch.findFirst({
      where: {
        id: matchId,
        userId: req.user.id,
      },
      include: {
        jobAnalysis: {
          include: {
            job: true,
          },
        },
      },
    });

    if (!match) {
      return res.status(404).json({
        error: "Match not found",
        message: "The requested match does not exist or you don't have access to it.",
      });
    }

    return res.json({
      match: {
        id: match.id,
        job: {
          id: match.jobAnalysis.job.id,
          title: match.jobAnalysis.job.title,
          company: match.jobAnalysis.job.company,
          companyLogoUrl: match.jobAnalysis.job.companyLogoUrl || null,
          location: match.jobAnalysis.job.location,
          url: match.jobAnalysis.job.url,
          postedDate: match.jobAnalysis.job.postedDate,
          salaryMin: match.jobAnalysis.job.salaryMin,
          salaryMax: match.jobAnalysis.job.salaryMax,
          salaryCurrency: match.jobAnalysis.job.salaryCurrency,
        },
        analysis: {
          mustHaveSkills: match.jobAnalysis.mustHaveSkills || [],
          niceToHaveSkills: match.jobAnalysis.niceToHaveSkills || [],
          experienceYears: match.jobAnalysis.experienceYears,
          educationLevel: match.jobAnalysis.educationLevel,
          languageRequirements: match.jobAnalysis.languageRequirements || [],
        },
        matchScore: match.matchScore,
        skillMatch: {
          score: match.skillMatchScore,
          matchingMustHave: [],
          missingMustHave: [],
          matchingNiceToHave: [],
          missingNiceToHave: [],
        },
        experienceMatch: match.experienceMatch,
        educationMatch: match.educationMatch,
        languageMatch: match.languageMatch,
        matchExplanation: match.matchExplanation || {
          summary: "Match analysis available.",
          strengths: [],
          gaps: [],
          recommendations: [],
        },
        userNotes: match.userNotes || null,
        applicationStatus: match.applicationStatus || null,
        appliedAt: match.appliedAt ? match.appliedAt.toISOString() : null,
        interviewDate: match.interviewDate ? match.interviewDate.toISOString() : null,
        outcome: match.outcome || null,
        calculatedAt: match.calculatedAt.toISOString(),
        matchedAt: match.calculatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Saved Match] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch saved match",
      message: error?.message || "Internal server error",
    });
  }
};

export const updateSavedMatch = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { matchId } = req.params;
    const { userNotes, applicationStatus, appliedAt, interviewDate, outcome } = req.body;

    const match = await (prisma as any).userJobMatch.findFirst({
      where: {
        id: matchId,
        userId: req.user.id,
      },
    });

    if (!match) {
      return res.status(404).json({
        error: "Match not found",
        message: "The requested match does not exist or you don't have access to it.",
      });
    }

    const updateData: any = {};

    if (userNotes !== undefined) {
      updateData.userNotes = userNotes || null;
    }

    if (applicationStatus !== undefined) {
      updateData.applicationStatus = applicationStatus || null;
      
      if (applicationStatus === "APPLIED" && !match.appliedAt) {
        updateData.appliedAt = new Date();
      }
      
      if (applicationStatus !== "INTERVIEW" && match.interviewDate) {
        updateData.interviewDate = null;
      }
    }

    if (appliedAt !== undefined) {
      updateData.appliedAt = appliedAt ? new Date(appliedAt) : null;
    }

    if (interviewDate !== undefined) {
      if (interviewDate) {
        const date = new Date(interviewDate);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            error: "Invalid interview date",
            message: "Interview date must be a valid ISO date string (e.g., '2025-01-15T14:30:00Z').",
          });
        }
        updateData.interviewDate = date;
        if (!updateData.applicationStatus && match.applicationStatus !== "INTERVIEW") {
          updateData.applicationStatus = "INTERVIEW";
        }
      } else {
        updateData.interviewDate = null;
      }
    }

    if (outcome !== undefined) {
      updateData.outcome = outcome || null;
    }

    const updatedMatch = await (prisma as any).userJobMatch.update({
      where: { id: matchId },
      data: updateData,
      include: {
        jobAnalysis: {
          include: {
            job: true,
          },
        },
      },
    });

    return res.json({
      match: {
        id: updatedMatch.id,
        job: {
          id: updatedMatch.jobAnalysis.job.id,
          title: updatedMatch.jobAnalysis.job.title,
          company: updatedMatch.jobAnalysis.job.company,
          companyLogoUrl: updatedMatch.jobAnalysis.job.companyLogoUrl || null,
          location: updatedMatch.jobAnalysis.job.location,
          url: updatedMatch.jobAnalysis.job.url,
          postedDate: updatedMatch.jobAnalysis.job.postedDate,
          salaryMin: updatedMatch.jobAnalysis.job.salaryMin,
          salaryMax: updatedMatch.jobAnalysis.job.salaryMax,
          salaryCurrency: updatedMatch.jobAnalysis.job.salaryCurrency,
        },
        analysis: {
          mustHaveSkills: updatedMatch.jobAnalysis.mustHaveSkills || [],
          niceToHaveSkills: updatedMatch.jobAnalysis.niceToHaveSkills || [],
          experienceYears: updatedMatch.jobAnalysis.experienceYears,
          educationLevel: updatedMatch.jobAnalysis.educationLevel,
          languageRequirements: updatedMatch.jobAnalysis.languageRequirements || [],
        },
        matchScore: updatedMatch.matchScore,
        skillMatch: {
          score: updatedMatch.skillMatchScore,
          matchingMustHave: [],
          missingMustHave: [],
          matchingNiceToHave: [],
          missingNiceToHave: [],
        },
        experienceMatch: updatedMatch.experienceMatch,
        educationMatch: updatedMatch.educationMatch,
        languageMatch: updatedMatch.languageMatch,
        matchExplanation: updatedMatch.matchExplanation,
        userNotes: updatedMatch.userNotes || null,
        applicationStatus: updatedMatch.applicationStatus || null,
        appliedAt: updatedMatch.appliedAt || null,
        interviewDate: updatedMatch.interviewDate || null,
        outcome: updatedMatch.outcome || null,
        calculatedAt: updatedMatch.calculatedAt,
      },
    });
  } catch (error: any) {
    console.error("[Update Match] Error:", error);
    return res.status(500).json({
      error: "Failed to update match",
      message: error?.message || "Internal server error",
    });
  }
};

export const deleteSavedMatch = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { matchId } = req.params;

    const match = await (prisma as any).userJobMatch.findFirst({
      where: {
        id: matchId,
        userId: req.user.id,
      },
    });

    if (!match) {
      return res.status(404).json({
        error: "Match not found",
        message: "The requested match does not exist or you don't have access to it.",
      });
    }

    await (prisma as any).userJobMatch.delete({
      where: { id: matchId },
    });

    return res.json({
      success: true,
      message: "Match deleted successfully",
    });
  } catch (error: any) {
    console.error("[Delete Match] Error:", error);
    return res.status(500).json({
      error: "Failed to delete match",
      message: error?.message || "Internal server error",
    });
  }
};

export const matchSpecificJob = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  let creditTransactionId: string | undefined;

  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { jobDescription, resumeId } = req.body;

    if (!jobDescription || typeof jobDescription !== "string" || jobDescription.trim().length < 100) {
      return res.status(400).json({
        error: "Invalid job description",
        message: "Job description must be at least 100 characters long.",
      });
    }

    let resume;
    if (resumeId) {
      resume = await (prisma as any).resume.findFirst({
        where: {
          id: resumeId,
          userId: req.user.id,
          status: "READY",
        },
      });
    } else {
      resume = await (prisma as any).resume.findFirst({
        where: {
          userId: req.user.id,
          status: "READY",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    if (!resume || !resume.parsedText) {
      return res.status(404).json({
        error: "No resume found",
        message: "Please upload a resume first to match jobs.",
      });
    }

    const { hasCredits, currentBalance, required } = await CreditService.hasEnoughCredits(
      req.user.id,
      Feature.JOB_MATCHING,
    );

    if (!hasCredits) {
      return res.status(402).json({
        error: "Insufficient credits",
        message: `You need ${required} credits to match a job. Current balance: ${currentBalance}`,
        currentBalance,
        required,
      });
    }

    const { transactionId } = await CreditService.deductCredits(
      req.user.id,
      Feature.JOB_MATCHING,
      { action: "match_specific_job" },
    );
    creditTransactionId = transactionId;

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

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const extractionCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a job description parser. Extract structured information from job descriptions. You MUST extract company name and location if they appear anywhere in the text.

Return JSON with this EXACT structure:
{
  "title": "Job title",
  "company": "Company name or null",
  "location": "Location or null",
  "requiredSkills": ["skill1", "skill2", ...],
  "niceToHaveSkills": ["skill1", "skill2", ...],
  "experienceYears": number or null,
  "educationLevel": "string or null",
  "languageRequirements": ["language1", "language2", ...]
}

CRITICAL EXTRACTION RULES:

1. **TITLE**: 
   - Extract the exact job title if mentioned (e.g., "Backend Engineer", "Software Developer", "Senior Full-Stack Developer")
   - If not explicitly mentioned, infer from the role description (e.g., if it says "We're looking for Backend Engineers", extract "Backend Engineer")
   - If completely unclear, generate a descriptive title based on responsibilities

2. **COMPANY** (MANDATORY - search thoroughly):
   - Search the ENTIRE description for company name
   - Common patterns: "At [Company]", "About [Company]", "[Company] is", "Working at [Company]", "[Company]'s", "join [Company]"
   - Look in headers, first paragraph, contact info, anywhere
   - Examples: "At Wolt" → "Wolt", "About Google" → "Google", "join our team at Microsoft" → "Microsoft"
   - If you find ANY company name, extract it. Only set to null if absolutely no company name appears.

3. **LOCATION** (MANDATORY - search thoroughly):
   - Search for city names, country names, or location phrases
   - Look for: "based in", "located in", "in [city]", "from [city]", "remote", "hybrid", "🌍 Where You'll Work"
   - Extract ALL mentioned locations (e.g., "Helsinki or Stockholm" → "Helsinki, Stockholm")
   - If multiple cities mentioned, combine them: "Helsinki, Stockholm, Berlin"
   - Include remote/hybrid context if mentioned
   - Examples: "based in Helsinki" → "Helsinki", "Helsinki or Stockholm" → "Helsinki, Stockholm", "remote-friendly" → "Remote"
   - If you find ANY location, extract it. Only set to null if absolutely no location appears.

Remember: Company and location are often in the first few paragraphs or in dedicated sections. Read the ENTIRE description carefully.`,
        },
        {
          role: "user",
          content: `Extract job information from this job description:\n\n${jobDescription.substring(0, 5000)}`,
        },
      ],
    });

    const extractionContent = extractionCompletion.choices[0]?.message?.content;
    if (!extractionContent) {
      throw new Error("Failed to extract job requirements");
    }

    const cleaned = extractionContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const extractedJob = JSON.parse(cleaned);

    console.log("[Specific Job Matching] Extracted job data:", {
      title: extractedJob.title,
      company: extractedJob.company,
      location: extractedJob.location,
    });

    const jobAnalysis = {
      mustHaveSkills: Array.isArray(extractedJob.requiredSkills) ? extractedJob.requiredSkills : [],
      niceToHaveSkills: Array.isArray(extractedJob.niceToHaveSkills) ? extractedJob.niceToHaveSkills : [],
      experienceYears: typeof extractedJob.experienceYears === "number" ? extractedJob.experienceYears : null,
      educationLevel: typeof extractedJob.educationLevel === "string" ? extractedJob.educationLevel : null,
      languageRequirements: Array.isArray(extractedJob.languageRequirements) ? extractedJob.languageRequirements : [],
    };

    const externalJobTitle = extractedJob.title || "External Job";
    const externalJobCompany = extractedJob.company && extractedJob.company !== "null" ? extractedJob.company : null;
    const externalJobLocation = extractedJob.location && extractedJob.location !== "null" ? extractedJob.location : null;
    
    console.log("[Specific Job Matching] Using extracted values:", {
      title: externalJobTitle,
      company: externalJobCompany,
      location: externalJobLocation,
    });

    const commonSkills = new Set([
      "git", "github", "vite", "npm", "yarn", "agile", "scrum",
      "jira", "confluence", "slack", "docker", "kubernetes", "linux", "unix",
      "rest", "api", "http", "https", "json", "xml", "sql", "nosql"
    ]);

    const filterCommonSkills = (skills: string[]): string[] => {
      return skills.filter(skill => {
        const skillLower = skill.toLowerCase();
        return !commonSkills.has(skillLower) && 
               !skillLower.includes("git") && 
               !skillLower.includes("vite") &&
               !skillLower.includes("npm");
      });
    };

    const filteredMustHave = filterCommonSkills(jobAnalysis.mustHaveSkills);
    const filteredNiceToHave = filterCommonSkills(jobAnalysis.niceToHaveSkills);
    const filteredUserSkills = filterCommonSkills(userSkills);

    const analysis = await analyzeJobMatchWithLLM({
      job: {
        id: "external",
        title: externalJobTitle,
        company: externalJobCompany,
        location: externalJobLocation,
        url: null,
        postedDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        descriptionRaw: jobDescription.substring(0, 2000),
        analysis: jobAnalysis,
      },
      cvText: resume.parsedText.substring(0, 5000),
      userSkills: filteredUserSkills,
      userExperienceYears: resume.yearsOfExperience || user?.yearsOfExperience,
      userEducationLevel: resume.educationLevel || undefined,
      userLanguages: ["Finnish", "English"],
      userCurrentPosition: user?.currentPosition || undefined,
      vectorSimilarity: 0.5,
    });

    const jobDescriptionHash = crypto
      .createHash("sha256")
      .update(jobDescription)
      .digest("hex")
      .substring(0, 16);

    let externalJob = await (prisma as any).job.findFirst({
      where: {
        externalId: `external_${req.user.id}_${jobDescriptionHash}`,
      },
      include: {
        analysis: true,
      },
    });

    if (!externalJob) {
      const { generateEmbedding } = await import("../../utils/embeddings");
      const jobEmbedding = await generateEmbedding(
        `${externalJobTitle}\n${jobDescription.substring(0, 2000)}`
      );

      externalJob = await (prisma as any).job.create({
        data: {
          title: externalJobTitle,
          company: externalJobCompany,
          location: externalJobLocation,
          descriptionRaw: jobDescription,
          externalId: `external_${req.user.id}_${jobDescriptionHash}`,
          isProcessed: true,
        },
      });

      const embeddingArray = `[${jobEmbedding.join(",")}]`;
      
      try {
        await prisma.$executeRaw`
          INSERT INTO "JobAnalysis" (
            "id", "jobId", "mustHaveSkills", "niceToHaveSkills", 
            "experienceYears", "educationLevel", "languageRequirements", 
            "analysisEmbedding", "processedAt"
          )
          VALUES (
            gen_random_uuid(),
            ${externalJob.id}::text,
            ${jobAnalysis.mustHaveSkills}::text[],
            ${jobAnalysis.niceToHaveSkills}::text[],
            ${jobAnalysis.experienceYears ?? null}::integer,
            ${jobAnalysis.educationLevel ?? null}::text,
            ${jobAnalysis.languageRequirements}::text[],
            ${embeddingArray}::vector(1536),
            NOW()
          )
        `;
      } catch (insertError: any) {
        console.error("[Specific Job Matching] Failed to insert JobAnalysis:", insertError);
        console.error("[Specific Job Matching] Job ID:", externalJob.id);
        console.error("[Specific Job Matching] Error details:", insertError.message, insertError.code);
        throw new Error(`Failed to create job analysis: ${insertError.message}`);
      }

      const jobAnalysisRecord = await prisma.$queryRaw<any[]>`
        SELECT 
          "id", "jobId", "mustHaveSkills", "niceToHaveSkills", 
          "experienceYears", "educationLevel", "languageRequirements", 
          "analysisEmbedding"::text as "analysisEmbedding",
          "processedAt"
        FROM "JobAnalysis" 
        WHERE "jobId" = ${externalJob.id}::text 
        LIMIT 1
      `;

      if (!jobAnalysisRecord || jobAnalysisRecord.length === 0) {
        console.error("[Specific Job Matching] JobAnalysis record not found after insert. Job ID:", externalJob.id);
        throw new Error("JobAnalysis record was not created or could not be retrieved");
      }

      externalJob.analysis = jobAnalysisRecord[0];
    } else if (!externalJob.analysis) {
      const { generateEmbedding } = await import("../../utils/embeddings");
      const jobEmbedding = await generateEmbedding(
        `${externalJobTitle}\n${jobDescription.substring(0, 2000)}`
      );

      const embeddingArray = `[${jobEmbedding.join(",")}]`;
      
      try {
        await prisma.$executeRaw`
          INSERT INTO "JobAnalysis" (
            "id", "jobId", "mustHaveSkills", "niceToHaveSkills", 
            "experienceYears", "educationLevel", "languageRequirements", 
            "analysisEmbedding", "processedAt"
          )
          VALUES (
            gen_random_uuid(),
            ${externalJob.id}::text,
            ${jobAnalysis.mustHaveSkills}::text[],
            ${jobAnalysis.niceToHaveSkills}::text[],
            ${jobAnalysis.experienceYears ?? null}::integer,
            ${jobAnalysis.educationLevel ?? null}::text,
            ${jobAnalysis.languageRequirements}::text[],
            ${embeddingArray}::vector(1536),
            NOW()
          )
        `;
      } catch (insertError: any) {
        console.error("[Specific Job Matching] Failed to insert JobAnalysis for existing job:", insertError);
        throw new Error(`Failed to create job analysis: ${insertError.message}`);
      }

      const jobAnalysisRecord = await prisma.$queryRaw<any[]>`
        SELECT 
          "id", "jobId", "mustHaveSkills", "niceToHaveSkills", 
          "experienceYears", "educationLevel", "languageRequirements", 
          "analysisEmbedding"::text as "analysisEmbedding",
          "processedAt"
        FROM "JobAnalysis" 
        WHERE "jobId" = ${externalJob.id}::text 
        LIMIT 1
      `;

      if (!jobAnalysisRecord || jobAnalysisRecord.length === 0) {
        throw new Error("JobAnalysis record was not created or could not be retrieved");
      }

      externalJob.analysis = jobAnalysisRecord[0];
    }

    if (!externalJob.analysis) {
      externalJob = await (prisma as any).job.findUnique({
        where: { id: externalJob.id },
        include: { analysis: true },
      });
      
      if (!externalJob?.analysis) {
        throw new Error("Failed to create or retrieve job analysis for external job");
      }
    }

    if (!externalJob.analysis) {
      throw new Error("Failed to create job analysis for external job");
    }

    let savedMatch = await (prisma as any).userJobMatch.findUnique({
      where: {
        userId_jobId: {
          userId: req.user.id,
          jobId: externalJob.id,
        },
      },
    });

    if (!savedMatch) {
      savedMatch = await (prisma as any).userJobMatch.create({
        data: {
          userId: req.user.id,
          jobId: externalJob.id,
          matchScore: analysis.matchScore,
          skillMatchScore: analysis.skillMatch.score,
          titleMatchScore: 50,
          vectorSimilarity: 0.5,
          experienceMatch: analysis.experienceMatch,
          educationMatch: analysis.educationMatch,
          languageMatch: analysis.languageMatch,
          matchExplanation: analysis.matchExplanation as any,
          calculatedAt: new Date(),
        },
      });
    } else {
      savedMatch = await (prisma as any).userJobMatch.update({
        where: {
          userId_jobId: {
            userId: req.user.id,
            jobId: externalJob.id,
          },
        },
        data: {
          matchScore: analysis.matchScore,
          skillMatchScore: analysis.skillMatch.score,
          vectorSimilarity: 0.5,
          experienceMatch: analysis.experienceMatch,
          educationMatch: analysis.educationMatch,
          languageMatch: analysis.languageMatch,
          matchExplanation: analysis.matchExplanation as any,
          calculatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return res.json({
      match: {
        id: savedMatch.id,
        job: {
          id: externalJob.id,
          title: externalJob.title,
          company: externalJob.company,
          companyLogoUrl: externalJob.companyLogoUrl || null,
          location: externalJob.location,
          url: null,
          postedDate: null,
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
        },
        analysis: jobAnalysis,
        matchScore: analysis.matchScore,
        skillMatch: analysis.skillMatch,
        experienceMatch: analysis.experienceMatch,
        educationMatch: analysis.educationMatch,
        languageMatch: analysis.languageMatch,
        matchExplanation: analysis.matchExplanation,
        userNotes: savedMatch.userNotes || null,
        applicationStatus: savedMatch.applicationStatus || null,
        appliedAt: savedMatch.appliedAt ? savedMatch.appliedAt.toISOString() : null,
        interviewDate: savedMatch.interviewDate ? savedMatch.interviewDate.toISOString() : null,
        outcome: savedMatch.outcome || null,
        calculatedAt: savedMatch.calculatedAt.toISOString(),
        matchedAt: savedMatch.calculatedAt.toISOString(),
      },
      saved: true,
    });
  } catch (error: any) {
    console.error("[Specific Job Matching] Error:", error);

    if (creditTransactionId && req.user?.id) {
      await CreditService.refundCredits(
        req.user.id,
        Feature.JOB_MATCHING,
        "Job matching failed",
        { transactionId: creditTransactionId },
      ).catch(console.error);
    }

    return res.status(500).json({
      error: "Failed to match job",
      message: error?.message || "Internal server error",
    });
  }
};

