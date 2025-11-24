-- ============================================
-- ADD USER BAN FIELDS
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- Add ban status fields to User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "banReason" TEXT,
ADD COLUMN IF NOT EXISTS "bannedBy" TEXT;

-- Add index for faster ban status queries
CREATE INDEX IF NOT EXISTS "User_isBanned_idx" ON "User"("isBanned");

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Next steps:
-- 1. Run: railway run npm run prisma:generate
-- 2. Test ban/unban endpoints
-- ============================================

