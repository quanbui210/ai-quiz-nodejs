import { Router } from "express";
import {
  loginWithGoogle,
  handleCallback,
  getSession,
  getCurrentUser,
  signOut,
} from "./auth.controller";

const router = Router();

/**
 * @route   GET /api/auth/googleLogin
 * @desc    Initiate Google OAuth login
 * @access  Public
 */
router.get("/login", loginWithGoogle);

/**
 * @route   GET /api/auth/callback
 * @desc    Handle OAuth callback from Google
 * @access  Public
 */
router.get("/callback", handleCallback);

/**
 * @route   GET /api/auth/session
 * @desc    Get current user session
 * @access  Private
 */
router.get("/session", getSession);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 */
router.get("/me", getCurrentUser);

/**
 * @route   POST /api/auth/signout
 * @desc    Sign out current user
 * @access  Private
 */
router.post("/signout", signOut);

export default router;
