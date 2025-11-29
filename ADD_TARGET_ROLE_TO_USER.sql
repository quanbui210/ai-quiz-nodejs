-- Add targetRole field to User table for onboarding
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "targetRole" TEXT;

