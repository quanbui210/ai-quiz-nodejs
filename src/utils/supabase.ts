import { createClient } from "@supabase/supabase-js";

// In Railway/production, env vars are already in process.env
// dotenv.config() is only needed for local development with .env file
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseAnonKey) {
  throw new Error("Missing SUPABASE_ANON_KEY environment variable");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
