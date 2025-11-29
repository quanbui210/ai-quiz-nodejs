import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/limit-check.middleware";
import prisma from "../../utils/prisma";
import {
  calculateMarketTrends,
  storeMarketTrends,
  analyzeMarketTrendsWithAI,
} from "./job-trends.service";


export const getMarketTrends = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { location, role, country = "fi", recalculate = "false" } = req.query;

    const countryCode = typeof country === "string" ? country.toLowerCase() : "fi";
    const normalizedLocation =
      typeof location === "string" && location.trim().length > 0
        ? location.trim()
        : undefined;
    const normalizedRole =
      typeof role === "string" && role.trim().length > 0
        ? role.trim()
        : undefined;
    const shouldRecalculate = recalculate === "true";

    // Try to get cached trends first (if not recalculating)
    if (!shouldRecalculate) {
      const periodStart = new Date();
      periodStart.setDate(1); // Start of current month

      // Try to get cached trends using raw SQL (Prisma client needs regeneration)
      // For general market insights, always use role=null (ignore role parameter from frontend)
      // Only use role-specific trends if explicitly requested AND we have data
      const periodStartStr = periodStart.toISOString();
      
      // First try to get general trends (role=null) - this is what we want for "Market Insights" page
      let cached = await prisma.$queryRaw<any[]>`
        SELECT * FROM "MarketTrends"
        WHERE "country" = ${countryCode}
          AND "location" IS NULL
          AND "role" IS NULL
          AND DATE_TRUNC('month', "periodStart") = DATE_TRUNC('month', ${periodStart}::timestamp)
        ORDER BY "calculatedAt" DESC
        LIMIT 1
      `;
      
      // If no general trends found, try role-specific (only if role was provided)
      if ((!cached || cached.length === 0) && normalizedRole) {
        cached = await prisma.$queryRaw<any[]>`
          SELECT * FROM "MarketTrends"
          WHERE "country" = ${countryCode}
            AND ("location" = ${normalizedLocation || null} OR ("location" IS NULL AND ${normalizedLocation === undefined}))
            AND "role" = ${normalizedRole}
            AND DATE_TRUNC('month', "periodStart") = DATE_TRUNC('month', ${periodStart}::timestamp)
          ORDER BY "calculatedAt" DESC
          LIMIT 1
        `;
      }
      
      const cachedTrend = cached && cached.length > 0 ? cached[0] : null;

      if (cachedTrend) {
        // Convert skills to detailed format
        const topMustHaveSkillsObj = cachedTrend.topMustHaveSkills as Record<string, number>;
        const topNiceToHaveSkillsObj = cachedTrend.topNiceToHaveSkills as Record<string, number>;
        const totalJobsNum = Number(cachedTrend.totalJobs);
        
        const topMustHaveSkillsDetailed = Object.entries(topMustHaveSkillsObj)
          .map(([skill, count]) => ({
            skill,
            count: Number(count),
            percentage: totalJobsNum > 0 ? Math.round((Number(count) / totalJobsNum) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

        const topNiceToHaveSkillsDetailed = Object.entries(topNiceToHaveSkillsObj)
          .map(([skill, count]) => ({
            skill,
            count: Number(count),
            percentage: totalJobsNum > 0 ? Math.round((Number(count) / totalJobsNum) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

        // Get AI analysis from cache (stored in salaryStats._aiAnalysis)
        const salaryStatsObj = cachedTrend.salaryStats as any;
        const aiAnalysis = salaryStatsObj?._aiAnalysis || null;
        
        // Extract actual salary stats (without _aiAnalysis)
        const { _aiAnalysis, ...actualSalaryStats } = salaryStatsObj || {};

        return res.json({
          trends: {
            totalJobs: totalJobsNum,
            averageExperience: cachedTrend.averageExperience ? Number(cachedTrend.averageExperience) : null,
            topMustHaveSkills: topMustHaveSkillsObj,
            topNiceToHaveSkills: topNiceToHaveSkillsObj,
            topMustHaveSkillsDetailed,
            topNiceToHaveSkillsDetailed,
            salaryStats: {
              ...actualSalaryStats,
              currency: actualSalaryStats?.currency || "EUR",
            },
            companyStats: cachedTrend.companyStats as any,
            roleDistribution: cachedTrend.roleDistribution as any,
          },
          analysis: aiAnalysis, // AI-generated insights
          period: {
            start: cachedTrend.periodStart,
            end: cachedTrend.periodEnd,
          },
          calculatedAt: cachedTrend.calculatedAt,
          cached: true,
        });
      }
    }

    // Calculate trends on-demand (shouldn't happen often - usually cached)
    const trends = await calculateMarketTrends(
      countryCode,
      normalizedLocation,
      normalizedRole,
    );

    // Store in cache with AI analysis (async, don't wait)
    // This will generate AI analysis and store it
    storeMarketTrends(countryCode, normalizedLocation, normalizedRole).catch(
      (error) => {
        console.error("[Market Trends] Failed to cache trends:", error);
      },
    );

    // For on-demand requests, generate AI analysis (but this should be rare)
    let aiAnalysis = null;
    try {
      if (trends.totalJobs > 0) {
        aiAnalysis = await analyzeMarketTrendsWithAI(
          trends,
          countryCode,
          normalizedLocation,
          normalizedRole,
        );
      }
    } catch (error) {
      console.error("[Market Trends] Failed to generate AI analysis:", error);
    }

    // Convert skills to detailed format for better frontend display
    const topMustHaveSkillsDetailed = Object.entries(trends.topMustHaveSkills)
      .map(([skill, count]) => ({
        skill,
        count,
        percentage: trends.totalJobs > 0 ? Math.round((count / trends.totalJobs) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topNiceToHaveSkillsDetailed = Object.entries(trends.topNiceToHaveSkills)
      .map(([skill, count]) => ({
        skill,
        count,
        percentage: trends.totalJobs > 0 ? Math.round((count / trends.totalJobs) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      trends: {
        ...trends,
        topMustHaveSkillsDetailed,
        topNiceToHaveSkillsDetailed,
      },
      analysis: aiAnalysis, // AI-generated insights
      period: {
        start: new Date(new Date().setDate(1)),
        end: new Date(),
      },
      calculatedAt: new Date(),
      cached: false,
    });
  } catch (error: any) {
    console.error("[Market Trends] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch market trends",
      message: error?.message || "Internal server error",
    });
  }
};

