"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
if (!supabaseAnonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY environment variable");
}
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});
//# sourceMappingURL=supabase.js.map