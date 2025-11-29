import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { getJobMarketInsights } from "./market.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/market/insights:
 *   get:
 *     summary: Get AI-analyzed job market insights for a role and location
 *     description: Fetches real-time job market data from Adzuna and uses AI to analyze trends, skills, salary, and provide actionable recommendations. Perfect for onboarding flow to show users market insights before creating a roadmap.
 *     tags: [Market]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *         description: Target role (e.g., "Full Stack Developer", "Senior Frontend Engineer"). If not provided, will use targetRole from user profile or active career goal.
 *       - in: query
 *         name: location
 *         required: false
 *         schema:
 *           type: string
 *         description: Specific location (e.g., "Helsinki", "London")
 *       - in: query
 *         name: country
 *         required: false
 *         schema:
 *           type: string
 *         description: Country code (e.g., "fi", "gb", "us"). Defaults to ADZUNA_DEFAULT_COUNTRY env var.
 *       - in: query
 *         name: currentPosition
 *         required: false
 *         schema:
 *           type: string
 *         description: User's current position (for skill gap analysis)
 *       - in: query
 *         name: currentSkills
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated or JSON array of current skills (e.g., "React,TypeScript,Node.js" or '["React","TypeScript"]')
 *     responses:
 *       200:
 *         description: Job market insights with AI analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rawData:
 *                   $ref: "#/components/schemas/JobMarketInsights"
 *                 analysis:
 *                   type: object
 *                   properties:
 *                     marketTrends:
 *                       type: object
 *                     skillAnalysis:
 *                       type: object
 *                     salaryInsights:
 *                       type: object
 *                     careerRecommendations:
 *                       type: object
 *                     companyInsights:
 *                       type: object
 *                 summary:
 *                   type: object
 *                   description: Convenience fields for quick frontend display
 *       400:
 *         description: Missing required parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No job market data available for this role/location
 *       500:
 *         description: Server error
 */
router.get("/insights", authenticate, getJobMarketInsights);

export default router;

