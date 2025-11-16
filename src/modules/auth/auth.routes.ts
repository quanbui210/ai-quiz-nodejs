import { Router } from "express";
import {
  loginWithGoogle,
  loginWithEmail,
  handleCallback,
  getSession,
  getCurrentUser,
  signOut,
} from "./auth.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/auth/login:
 *   get:
 *     summary: Initiate Google OAuth login
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: redirectTo
 *         schema:
 *           type: string
 *         description: Optional custom redirect URL after authentication
 *     responses:
 *       200:
 *         description: OAuth URL for redirect
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Google OAuth URL to redirect user to
 *                 message:
 *                   type: string
 *       400:
 *         description: OAuth error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/login", loginWithGoogle);
router.post("/login", loginWithEmail);

/**
 * @swagger
 * /api/v1/auth/callback:
 *   get:
 *     summary: Handle OAuth callback from Google (PKCE flow with code)
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: OAuth error if any
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: "#/components/schemas/User"
 *                 session:
 *                   $ref: "#/components/schemas/Session"
 *       400:
 *         description: Invalid callback or missing code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *   post:
 *     summary: Handle OAuth callback with tokens from HTML page
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - access_token
 *             properties:
 *               access_token:
 *                 type: string
 *                 description: Supabase access token
 *               refresh_token:
 *                 type: string
 *                 description: Supabase refresh token
 *               expires_at:
 *                 type: number
 *                 description: Token expiration timestamp
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: "#/components/schemas/User"
 *                 session:
 *                   $ref: "#/components/schemas/Session"
 *       400:
 *         description: Invalid tokens or session error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/callback", handleCallback);
router.post("/callback", handleCallback);

/**
 * @swagger
 * /api/v1/auth/session:
 *   get:
 *     summary: Get current user session
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current session information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   $ref: "#/components/schemas/Session"
 *       401:
 *         description: Unauthorized - No active session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/session", getSession);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: "#/components/schemas/User"
 *       401:
 *         description: Unauthorized - No active session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/me", getCurrentUser);

/**
 * @swagger
 * /api/v1/auth/signout:
 *   post:
 *     summary: Sign out current user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully signed out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/signout", signOut);

export default router;
