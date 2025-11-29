import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  saveOnboarding,
  getUserProfile,
  updateUserProfile,
} from "./user.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/user/onboarding:
 *   post:
 *     summary: Save user onboarding data
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPosition:
 *                 type: string
 *                 description: User's current job position
 *               currentSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of user's current skills
 *               resumeId:
 *                 type: string
 *                 description: ID of the resume uploaded during onboarding
 *               yearsOfExperience:
 *                 type: number
 *                 description: Years of professional experience
 *               industry:
 *                 type: string
 *                 description: Industry the user works in
 *               skip:
 *                 type: boolean
 *                 description: If true, skip onboarding without saving data
 *     responses:
 *       200:
 *         description: Onboarding data saved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/onboarding", authenticate, saveOnboarding);

/**
 * @swagger
 * /api/v1/user/profile:
 *   get:
 *     summary: Get user profile data for prefilling forms
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     hasCompletedOnboarding:
 *                       type: boolean
 *                     currentPosition:
 *                       type: string
 *                     currentSkills:
 *                       type: array
 *                       items:
 *                         type: string
 *                     onboardingResumeId:
 *                       type: string
 *                     yearsOfExperience:
 *                       type: number
 *                     industry:
 *                       type: string
 *                     resume:
 *                       type: object
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get("/profile", authenticate, getUserProfile);

/**
 * @swagger
 * /api/v1/user/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPosition:
 *                 type: string
 *               currentSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *               resumeId:
 *                 type: string
 *               yearsOfExperience:
 *                 type: number
 *               industry:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Resume not found (if resumeId provided)
 *       500:
 *         description: Server error
 */
router.put("/profile", authenticate, updateUserProfile);

export default router;

