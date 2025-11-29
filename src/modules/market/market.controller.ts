import { Response } from "express";
import prisma from "../../utils/prisma";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import type { JobMarketInsights } from "./finnish-jobs.service";
import { fetchFinnishJobInsights } from "./finnish-jobs.service";
import { analyzeJobMarketWithAI } from "./market.service";

export const getJobMarketInsights = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { role, location, country } = req.query;

    // Role is required
    if (!role || typeof role !== "string" || !role.trim()) {
      return res.status(400).json({
        error: "Role parameter is required",
        message:
          "Please provide a target role in the query (e.g., ?role=DevOps%20Engineer).",
      });
    }

    const normalizedRole = role.trim();
    const normalizedLocation =
      typeof location === "string" && location.trim().length > 0
        ? location.trim()
        : undefined;
    const normalizedCountry =
      typeof country === "string" && country.trim().length > 0
        ? country.trim().toLowerCase()
        : "fi"; // Default to Finland for now

    // Check for pre-fetched general market insights (fetched via cron job)
    const cachedInsight = await prisma.marketInsight.findUnique({
      where: {
        role_location_country: {
          role: normalizedRole,
          location: normalizedLocation || null,
          country: normalizedCountry || "default",
        },
      },
    });

    if (cachedInsight) {
      console.log(`[Market Insights] Using pre-fetched general insights for ${normalizedRole} in ${normalizedLocation || normalizedCountry}`);
      const rawData = cachedInsight.rawData as unknown as JobMarketInsights;
      const analysis = cachedInsight.analysis as any;
      
      return res.json({
        rawData: rawData,
        analysis: analysis,
        summary: {
          totalJobs: rawData.totalAvailable,
          sampleSize: rawData.sampleSize,
          location: rawData.location || rawData.country,
          role: rawData.role,
          salaryRange: rawData.salary
            ? {
                min: rawData.salary.min,
                max: rawData.salary.max,
                median: rawData.salary.median,
                average: rawData.salary.average,
                currency: rawData.salary.currency,
              }
            : null,
          topRequiredSkills: rawData.requiredSkills?.slice(0, 10) || [],
          topCompanies: rawData.topCompanies?.slice(0, 10) || [],
          activeListings: rawData.sampleListings?.length || 0,
        },
        lastUpdated: cachedInsight.fetchedAt,
        note: "General market insights (pre-fetched weekly). For personalized career roadmap with skill gaps, use the roadmap feature.",
      });
    }

    // No pre-fetched data available - return error suggesting to wait for cron job
    console.log(`[Market Insights] No pre-fetched data for ${normalizedRole} in ${normalizedLocation || normalizedCountry}`);
    
    return res.status(404).json({
      error: "Market insights not available",
      message: `Market insights for "${normalizedRole}" in "${normalizedLocation || normalizedCountry}" are not yet available. Popular roles are updated weekly via automated job.`,
      suggestion: "Try one of these popular roles: Full Stack Developer, Frontend Developer, Backend Developer, DevOps Engineer, Cloud Engineer, AI Engineer, ML Engineer, Data Engineer, Automation Engineer",
      lastUpdated: null,
    });
  } catch (error: any) {
    console.error("Get job market insights error:", error);
    return res.status(500).json({
      error: "Failed to fetch job market insights",
      message: error?.message || "Internal server error",
    });
  }
};

