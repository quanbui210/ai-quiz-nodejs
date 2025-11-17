"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const prisma_1 = __importDefault(require("../utils/prisma"));
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.substring(7);
    const supabase = (0, supabase_js_1.createClient)(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    const {
      data: { user: supabaseUser },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !supabaseUser) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    let prismaUser = await prisma_1.default.user.findUnique({
      where: {
        id: supabaseUser.id,
      },
    });
    if (!prismaUser) {
      prismaUser = await prisma_1.default.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email,
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
        prismaUser = await prisma_1.default.user.update({
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
exports.authenticate = authenticate;
//# sourceMappingURL=auth.middleware.js.map
