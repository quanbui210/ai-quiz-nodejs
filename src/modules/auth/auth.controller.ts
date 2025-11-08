import { Request, Response } from "express";
import { supabase } from "../../utils/supabase";

export const loginWithGoogle = async (req: Request, res: Response) => {
  try {
    const { redirectTo } = req.query;
    const redirectUrl =
      (redirectTo as string) || `${process.env.SUPABASE_URL}/auth/v1/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({
      url: data.url,
      message: "Redirect user to this URL to complete Google login",
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({ error: "Failed to initiate Google login" });
  }
};

export const handleCallback = async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

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
  } catch (error) {
    console.error("Callback error:", error);
    return res.status(500).json({ error: "Failed to handle OAuth callback" });
  }
};

export const getSession = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    if (!data.session) {
      return res.status(401).json({ error: "No active session" });
    }

    return res.json({
      user: data.session.user,
      session: data.session,
    });
  } catch (error) {
    console.error("Get session error:", error);
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

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    if (!user) {
      return res.status(401).json({ error: "No user found" });
    }

    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get user" });
  }
};
