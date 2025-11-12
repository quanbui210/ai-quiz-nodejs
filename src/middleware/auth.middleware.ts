import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import prisma from "../utils/prisma";

// Create a server-side Supabase client for token verification
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

/**
 * Authentication middleware that:
 * 1. Extracts the Bearer token from Authorization header
 * 2. Verifies the token with Supabase
 * 3. Finds or creates the Prisma User record
 * 4. Attaches the Prisma User to req.user
 */
export const authenticate = async (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user: supabaseUser },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !supabaseUser) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    let prismaUser = await prisma.user.findUnique({
      where: {
        id: supabaseUser.id,
      },
    });

    if (!prismaUser) {
      prismaUser = await prisma.user.create({
        data: {
          id: supabaseUser.id, // Use Supabase Auth ID as Prisma User ID
          email: supabaseUser.email as string,
          name:
            supabaseUser.user_metadata?.name ||
            supabaseUser.user_metadata?.full_name,
          avatarUrl: supabaseUser.user_metadata?.avatar_url,
        },
      });
    } else {
      const needsUpdate =
        prismaUser.name !==
          (supabaseUser.user_metadata?.name ||
            supabaseUser.user_metadata?.full_name) ||
        prismaUser.avatarUrl !== supabaseUser.user_metadata?.avatar_url;

      if (needsUpdate) {
        prismaUser = await prisma.user.update({
          where: { id: supabaseUser.id },
          data: {
            name:
              supabaseUser.user_metadata?.name ||
              supabaseUser.user_metadata?.full_name ||
              prismaUser.name,
            avatarUrl:
              supabaseUser.user_metadata?.avatar_url || prismaUser.avatarUrl,
          },
        });
      }
    }

    req.user = prismaUser;
    return next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
};
