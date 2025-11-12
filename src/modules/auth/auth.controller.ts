import { Request, Response } from "express";
import { supabase } from "../../utils/supabase";
import prisma from "../../utils/prisma";

export const loginWithGoogle = async (req: Request, res: Response) => {
  try {
    const { redirectTo } = req.query;
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
    const redirectUrl = (redirectTo as string) || `${backendUrl}/callback.html`;

    console.log("Initiating Google OAuth with redirectTo:", redirectUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: false,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    console.log("OAuth response:", { data, error });

    if (error || !data?.url) {
      return res
        .status(400)
        .json({
          error:
            (error?.message as string) ||
            "No redirect URL received" ||
            "OAuth error",
        });
    }

    return res.json({
      url: data.url,
      message: "Redirect user to this URL to complete Google login",
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to initiate Google login" });
  }
};

export const handleCallback = async (req: Request, res: Response) => {
  try {
    if (req.method === "POST" && req.body.access_token) {
      const { access_token, refresh_token, expires_at } = req.body;

      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token || "",
        });

      if (sessionError) {
        return res.status(400).json({ error: sessionError.message });
      }

      if (!sessionData?.user?.id) {
        return res
          .status(400)
          .json({ error: "Invalid session data: missing user ID" });
      }

      const supabaseUserId = sessionData.user.id;
      const userEmail = sessionData.user.email as string;

      let user = await prisma.user.findUnique({
        where: {
          id: supabaseUserId,
        },
      });

      if (!user) {
        const existingUser = await prisma.user.findUnique({
          where: {
            email: userEmail,
          },
        });

        if (existingUser) {
          try {
            await prisma.answer.deleteMany({
              where: { userId: existingUser.id },
            });
            await prisma.progress.deleteMany({
              where: { userId: existingUser.id },
            });
            await prisma.quiz.deleteMany({
              where: { userId: existingUser.id },
            });
            await prisma.topic.deleteMany({
              where: { userId: existingUser.id },
            });

            await prisma.user.delete({
              where: { id: existingUser.id },
            });
          } catch (deleteError: any) {
            console.error("Error deleting old user data:", deleteError);
          }
        }

        user = await prisma.user.create({
          data: {
            id: supabaseUserId,
            email: userEmail,
            name: sessionData.user.user_metadata?.name as string,
            avatarUrl: sessionData.user.user_metadata?.avatar_url as string,
          },
        });
      }

      return res.json({
        message: "Authentication successful, user created",
        user: sessionData.user,
        session: sessionData.session,
      });
    }

    const { code, access_token, error: oauthError } = req.query;

    if (oauthError) {
      return res.status(400).json({ error: oauthError as string });
    }

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code as string,
      );

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({
        message: "Authentication successful",
        user: data.user,
        session: data.session,
      });
    }

    return res.status(400).json({
      error: "Missing authorization code or token",
      message: "Expected POST request with tokens or GET with code parameter",
    });
  } catch (error: any) {
    console.error("Callback error:", error);
    return res.status(500).json({
      error: "Failed to handle OAuth callback",
      message: error?.message || "Unknown error",
    });
  }
};

export const getSession = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      return res
        .status(401)
        .json({ error: (error?.message as string) || "No active session" });
    }

    return res.json({
      user: data.session.user,
      session: data.session,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get session" });
  }
};

export const signOut = async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ message: "Signed out successfully" });
  } catch (error) {
    console.error("Sign out error:", error);
    return res.status(500).json({ error: "Failed to sign out" });
  }
};

export const getCurrentUser = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    const {
      data: { user: supabaseUser },
      error: supabaseError,
    } = await supabase.auth.getUser();

    if (supabaseError || !supabaseUser) {
      return res
        .status(401)
        .json({ error: supabaseError?.message || "No user found" });
    }

    const prismaUser = await prisma.user.findUnique({
      where: {
        id: supabaseUser.id,
      },
    });

    if (!prismaUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    return res.json({ user: prismaUser });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get user" });
  }
};
