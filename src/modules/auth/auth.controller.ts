import { Request, Response } from "express";
import { supabase } from "../../utils/supabase";
import prisma from "../../utils/prisma";

export const loginWithGoogle = async (req: Request, res: Response) => {
  try {
    const { redirectTo } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = (redirectTo as string) || `${frontendUrl}/auth/callback`;

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

    if (error || !data?.url) {
      return res.status(400).json({
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

        try {
          const { getOrCreateDefaultSubscription } = await import(
            "../../utils/subscription"
          );
          await getOrCreateDefaultSubscription(supabaseUserId);
        } catch (subscriptionError: any) {
          console.error(
            "Failed to initialize subscription:",
            subscriptionError,
          );
        }
      }

      const adminProfile = await prisma.adminUser.findUnique({
        where: { userId: supabaseUserId },
        select: {
          id: true,
          role: true,
          permissions: true,
        },
      });

      const response: any = {
        message: "Authentication successful, user created",
        user: sessionData.user,
        session: sessionData.session,
      };

      if (adminProfile) {
        response.isAdmin = true;
        response.admin = {
          role: adminProfile.role,
          permissions: adminProfile.permissions,
        };
      } else {
        response.isAdmin = false;
      }

      return res.json(response);
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

      const userId = data.user.id;

      try {
        let adminProfile = null;
        try {
          adminProfile = await prisma.adminUser.findUnique({
            where: { userId },
            select: {
              id: true,
              role: true,
              permissions: true,
            },
          });
        } catch (adminError: any) {
          console.error("Failed to check admin status:", adminError);
        }

        const response: any = {
          message: "Authentication successful",
          user: data.user,
          session: data.session,
        };

        if (adminProfile) {
          response.isAdmin = true;
          response.admin = {
            role: adminProfile.role,
            permissions: adminProfile.permissions,
          };
        } else {
          response.isAdmin = false;
        }

        return res.json(response);
      } catch (dbError: any) {
        console.error("Database error during OAuth callback:", dbError);

        // Check if it's a connection error
        if (
          dbError.message?.includes("Can't reach database server") ||
          dbError.message?.includes("P1001") ||
          dbError.code === "P1001"
        ) {
          return res.status(503).json({
            error: "Database connection failed",
            message:
              "Unable to connect to the database. Your Supabase database may be paused. Please check your Supabase dashboard and restore it if needed.",
            details:
              process.env.NODE_ENV === "development"
                ? dbError.message
                : undefined,
          });
        }

        // For other database errors, return generic error
        return res.status(500).json({
          error: "Failed to complete authentication",
          message:
            "An error occurred while processing your authentication. Please try again.",
          details:
            process.env.NODE_ENV === "development"
              ? dbError.message
              : undefined,
        });
      }
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

    const userId = data.session.user.id;

    const adminProfile = await prisma.adminUser.findUnique({
      where: { userId },
      select: {
        id: true,
        role: true,
        permissions: true,
      },
    });

    const response: any = {
      user: data.session.user,
      session: data.session,
    };

    if (adminProfile) {
      response.isAdmin = true;
      response.admin = {
        role: adminProfile.role,
        permissions: adminProfile.permissions,
      };
    } else {
      response.isAdmin = false;
    }

    return res.json(response);
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

export const loginWithEmail = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        error: "Invalid email or password",
        message: error.message,
      });
    }

    if (!data?.user || !data?.session) {
      return res.status(400).json({
        error: "Authentication failed",
        message: "No user or session returned",
      });
    }

    const supabaseUserId = data.user.id;
    const userEmail = data.user.email as string;

    try {
      let prismaUser = await prisma.user.findUnique({
        where: { id: supabaseUserId },
      });

      if (!prismaUser) {
        prismaUser = await prisma.user.create({
          data: {
            id: supabaseUserId,
            email: userEmail,
            name: data.user.user_metadata?.name || "User",
            avatarUrl: data.user.user_metadata?.avatar_url,
          },
        });

        // Create default subscription
        try {
          const { getOrCreateDefaultSubscription } = await import(
            "../../utils/subscription"
          );
          await getOrCreateDefaultSubscription(supabaseUserId);
        } catch (subscriptionError: any) {
          console.error(
            "Failed to initialize subscription:",
            subscriptionError,
          );
        }
      }

      let adminProfile = null;
      try {
        adminProfile = await prisma.adminUser.findUnique({
          where: { userId: supabaseUserId },
          select: {
            id: true,
            role: true,
            permissions: true,
          },
        });
      } catch (adminError: any) {
        console.error("Failed to check admin status:", adminError);
      }

      const response: any = {
        message: "Login successful",
        user: data.user,
        session: data.session,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };

      if (adminProfile) {
        response.isAdmin = true;
        response.admin = {
          role: adminProfile.role,
          permissions: adminProfile.permissions,
        };
      } else {
        response.isAdmin = false;
      }

      return res.json(response);
    } catch (dbError: any) {
      console.error("Database error during login:", dbError);

      if (
        dbError.message?.includes("Can't reach database server") ||
        dbError.message?.includes("P1001") ||
        dbError.code === "P1001"
      ) {
        return res.status(503).json({
          error: "Database connection failed",
          message:
            "Unable to connect to the database. Please check your database connection or try again later.",
          details:
            process.env.NODE_ENV === "development"
              ? dbError.message
              : undefined,
        });
      }

      // For other database errors, return generic error
      return res.status(500).json({
        error: "Failed to complete login",
        message:
          "An error occurred while processing your login. Please try again.",
        details:
          process.env.NODE_ENV === "development" ? dbError.message : undefined,
      });
    }
  } catch (error: any) {
    console.error("Email login error:", error);
    return res.status(500).json({
      error: "Failed to login",
      message: error.message || "An unexpected error occurred",
    });
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

    // Check if user is an admin
    const adminProfile = await prisma.adminUser.findUnique({
      where: { userId: supabaseUser.id },
      select: {
        id: true,
        role: true,
        permissions: true,
      },
    });

    const response: any = {
      user: prismaUser,
    };

    // Add admin information if user is an admin
    if (adminProfile) {
      response.isAdmin = true;
      response.admin = {
        role: adminProfile.role,
        permissions: adminProfile.permissions,
      };
    } else {
      response.isAdmin = false;
    }

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: "Failed to get user" });
  }
};
