import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { matchJobs, getRecentJobs } from "./job-matching.controller";
import { getMarketTrends } from "./job-trends.controller";

const router = Router();

/**
 * @swagger
 * /api/jobs/match:
 *   get:
 *     summary: Match user's CV to available jobs
 *     description: Uses vector search to find jobs that match user's CV, skills, and experience
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location (e.g., "Helsinki")
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by role (e.g., "Software Engineer")
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of matches to return
 *       - in: query
 *         name: minMatchScore
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Minimum match score (0-100)
 *     responses:
 *       200:
 *         description: Job matches
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No resume found
 */
router.get("/match", authenticate, matchJobs);

/**
 * @swagger
 * /api/jobs/recent:
 *   get:
 *     summary: Get recent job listings with full data and optional matching
 *     description: |
 *       Returns recent job postings with full details (description, company info, posted date).
 *       If user has uploaded a CV, automatically calculates match scores and sorts matched jobs first.
 *       Jobs include match analysis (strengths, gaps, recommendations) when CV is available.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location (e.g., "Helsinki")
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by role (e.g., "Software Engineer")
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Maximum number of jobs to return
 *     responses:
 *       200:
 *         description: Recent jobs with optional match data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       title: { type: string }
 *                       company: { type: string }
 *                       location: { type: string }
 *                       description: { type: string, description: "Full job description" }
 *                       postedDate: { type: string, format: date-time }
 *                       scrapedAt: { type: string, format: date-time }
 *                       salaryMin: { type: number }
 *                       salaryMax: { type: number }
 *                       salaryCurrency: { type: string }
 *                       jobType: { type: array, items: { type: string } }
 *                       experienceLevel: { type: string }
 *                       analysis: { type: object }
 *                       matchScore: { type: number, nullable: true }
 *                       isMatched: { type: boolean }
 *                       matchExplanation: { type: object, nullable: true }
 *                 total: { type: number }
 *                 hasMatches: { type: boolean }
 *                 userProfile: { type: object, nullable: true }
 */
router.get("/recent", authenticate, getRecentJobs);

/**
 * @swagger
 * /api/jobs/trends:
 *   get:
 *     summary: Get market trends
 *     description: Returns aggregated market statistics (skills, salaries, companies)
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by role
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           default: fi
 *         description: Country code
 *       - in: query
 *         name: recalculate
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Force recalculation instead of using cache
 *     responses:
 *       200:
 *         description: Market trends
 */
router.get("/trends", authenticate, getMarketTrends);

export default router;

