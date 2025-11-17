"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUser = exports.loginWithEmail = exports.signOut = exports.getSession = exports.handleCallback = exports.loginWithGoogle = void 0;
const supabase_1 = require("../../utils/supabase");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const loginWithGoogle = async (req, res) => {
    try {
        const { redirectTo } = req.query;
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const redirectUrl = redirectTo || `${frontendUrl}/auth/callback`;
        const { data, error } = await supabase_1.supabase.auth.signInWithOAuth({
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
                error: error?.message ||
                    "No redirect URL received" ||
                    "OAuth error",
            });
        }
        return res.json({
            url: data.url,
            message: "Redirect user to this URL to complete Google login",
        });
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to initiate Google login" });
    }
};
exports.loginWithGoogle = loginWithGoogle;
const handleCallback = async (req, res) => {
    try {
        if (req.method === "POST" && req.body.access_token) {
            const { access_token, refresh_token, expires_at } = req.body;
            const { data: sessionData, error: sessionError } = await supabase_1.supabase.auth.setSession({
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
            const userEmail = sessionData.user.email;
            let user = await prisma_1.default.user.findUnique({
                where: {
                    id: supabaseUserId,
                },
            });
            if (!user) {
                const existingUser = await prisma_1.default.user.findUnique({
                    where: {
                        email: userEmail,
                    },
                });
                if (existingUser) {
                    try {
                        await prisma_1.default.answer.deleteMany({
                            where: { userId: existingUser.id },
                        });
                        await prisma_1.default.progress.deleteMany({
                            where: { userId: existingUser.id },
                        });
                        await prisma_1.default.quiz.deleteMany({
                            where: { userId: existingUser.id },
                        });
                        await prisma_1.default.topic.deleteMany({
                            where: { userId: existingUser.id },
                        });
                        await prisma_1.default.user.delete({
                            where: { id: existingUser.id },
                        });
                    }
                    catch (deleteError) {
                        console.error("Error deleting old user data:", deleteError);
                    }
                }
                user = await prisma_1.default.user.create({
                    data: {
                        id: supabaseUserId,
                        email: userEmail,
                        name: sessionData.user.user_metadata?.name,
                        avatarUrl: sessionData.user.user_metadata?.avatar_url,
                    },
                });
                try {
                    const { getOrCreateDefaultSubscription } = await Promise.resolve().then(() => __importStar(require("../../utils/subscription")));
                    await getOrCreateDefaultSubscription(supabaseUserId);
                }
                catch (subscriptionError) {
                    console.error("Failed to initialize subscription:", subscriptionError);
                }
            }
            const adminProfile = await prisma_1.default.adminUser.findUnique({
                where: { userId: supabaseUserId },
                select: {
                    id: true,
                    role: true,
                    permissions: true,
                },
            });
            const response = {
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
            }
            else {
                response.isAdmin = false;
            }
            return res.json(response);
        }
        const { code, access_token, error: oauthError } = req.query;
        if (oauthError) {
            return res.status(400).json({ error: oauthError });
        }
        if (code) {
            const { data, error } = await supabase_1.supabase.auth.exchangeCodeForSession(code);
            if (error) {
                return res.status(400).json({ error: error.message });
            }
            const userId = data.user.id;
            try {
                let adminProfile = null;
                try {
                    adminProfile = await prisma_1.default.adminUser.findUnique({
                        where: { userId },
                        select: {
                            id: true,
                            role: true,
                            permissions: true,
                        },
                    });
                }
                catch (adminError) {
                    console.error("Failed to check admin status:", adminError);
                }
                const response = {
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
                }
                else {
                    response.isAdmin = false;
                }
                return res.json(response);
            }
            catch (dbError) {
                console.error("Database error during OAuth callback:", dbError);
                if (dbError.message?.includes("Can't reach database server") ||
                    dbError.message?.includes("P1001") ||
                    dbError.code === "P1001") {
                    return res.status(503).json({
                        error: "Database connection failed",
                        message: "Unable to connect to the database. Your Supabase database may be paused. Please check your Supabase dashboard and restore it if needed.",
                        details: process.env.NODE_ENV === "development"
                            ? dbError.message
                            : undefined,
                    });
                }
                return res.status(500).json({
                    error: "Failed to complete authentication",
                    message: "An error occurred while processing your authentication. Please try again.",
                    details: process.env.NODE_ENV === "development"
                        ? dbError.message
                        : undefined,
                });
            }
        }
        return res.status(400).json({
            error: "Missing authorization code or token",
            message: "Expected POST request with tokens or GET with code parameter",
        });
    }
    catch (error) {
        console.error("Callback error:", error);
        return res.status(500).json({
            error: "Failed to handle OAuth callback",
            message: error?.message || "Unknown error",
        });
    }
};
exports.handleCallback = handleCallback;
const getSession = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.auth.getSession();
        if (error || !data.session) {
            return res
                .status(401)
                .json({ error: error?.message || "No active session" });
        }
        const userId = data.session.user.id;
        const adminProfile = await prisma_1.default.adminUser.findUnique({
            where: { userId },
            select: {
                id: true,
                role: true,
                permissions: true,
            },
        });
        const response = {
            user: data.session.user,
            session: data.session,
        };
        if (adminProfile) {
            response.isAdmin = true;
            response.admin = {
                role: adminProfile.role,
                permissions: adminProfile.permissions,
            };
        }
        else {
            response.isAdmin = false;
        }
        return res.json(response);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to get session" });
    }
};
exports.getSession = getSession;
const signOut = async (req, res) => {
    try {
        const { error } = await supabase_1.supabase.auth.signOut();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        return res.json({ message: "Signed out successfully" });
    }
    catch (error) {
        console.error("Sign out error:", error);
        return res.status(500).json({ error: "Failed to sign out" });
    }
};
exports.signOut = signOut;
const loginWithEmail = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required",
            });
        }
        const { data, error } = await supabase_1.supabase.auth.signInWithPassword({
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
        const userEmail = data.user.email;
        try {
            let prismaUser = await prisma_1.default.user.findUnique({
                where: { id: supabaseUserId },
            });
            if (!prismaUser) {
                prismaUser = await prisma_1.default.user.create({
                    data: {
                        id: supabaseUserId,
                        email: userEmail,
                        name: data.user.user_metadata?.name || "User",
                        avatarUrl: data.user.user_metadata?.avatar_url,
                    },
                });
                try {
                    const { getOrCreateDefaultSubscription } = await Promise.resolve().then(() => __importStar(require("../../utils/subscription")));
                    await getOrCreateDefaultSubscription(supabaseUserId);
                }
                catch (subscriptionError) {
                    console.error("Failed to initialize subscription:", subscriptionError);
                }
            }
            let adminProfile = null;
            try {
                adminProfile = await prisma_1.default.adminUser.findUnique({
                    where: { userId: supabaseUserId },
                    select: {
                        id: true,
                        role: true,
                        permissions: true,
                    },
                });
            }
            catch (adminError) {
                console.error("Failed to check admin status:", adminError);
            }
            const response = {
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
            }
            else {
                response.isAdmin = false;
            }
            return res.json(response);
        }
        catch (dbError) {
            console.error("Database error during login:", dbError);
            if (dbError.message?.includes("Can't reach database server") ||
                dbError.message?.includes("P1001") ||
                dbError.code === "P1001") {
                return res.status(503).json({
                    error: "Database connection failed",
                    message: "Unable to connect to the database. Please check your database connection or try again later.",
                    details: process.env.NODE_ENV === "development"
                        ? dbError.message
                        : undefined,
                });
            }
            return res.status(500).json({
                error: "Failed to complete login",
                message: "An error occurred while processing your login. Please try again.",
                details: process.env.NODE_ENV === "development" ? dbError.message : undefined,
            });
        }
    }
    catch (error) {
        console.error("Email login error:", error);
        return res.status(500).json({
            error: "Failed to login",
            message: error.message || "An unexpected error occurred",
        });
    }
};
exports.loginWithEmail = loginWithEmail;
const getCurrentUser = async (req, res) => {
    try {
        const { data: { user: supabaseUser }, error: supabaseError, } = await supabase_1.supabase.auth.getUser();
        if (supabaseError || !supabaseUser) {
            return res
                .status(401)
                .json({ error: supabaseError?.message || "No user found" });
        }
        const prismaUser = await prisma_1.default.user.findUnique({
            where: {
                id: supabaseUser.id,
            },
        });
        if (!prismaUser) {
            return res.status(404).json({ error: "User profile not found" });
        }
        const adminProfile = await prisma_1.default.adminUser.findUnique({
            where: { userId: supabaseUser.id },
            select: {
                id: true,
                role: true,
                permissions: true,
            },
        });
        const response = {
            user: prismaUser,
        };
        if (adminProfile) {
            response.isAdmin = true;
            response.admin = {
                role: adminProfile.role,
                permissions: adminProfile.permissions,
            };
        }
        else {
            response.isAdmin = false;
        }
        return res.json(response);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to get user" });
    }
};
exports.getCurrentUser = getCurrentUser;
//# sourceMappingURL=auth.controller.js.map