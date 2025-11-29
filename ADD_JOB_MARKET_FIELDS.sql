-- Adds job market intelligence columns for Adzuna integration

ALTER TABLE "CareerGoal"
ADD COLUMN IF NOT EXISTS "targetCountryCode" TEXT,
ADD COLUMN IF NOT EXISTS "targetLocation" TEXT,
ADD COLUMN IF NOT EXISTS "jobMarketInsights" JSONB,
ADD COLUMN IF NOT EXISTS "jobMarketUpdatedAt" TIMESTAMP;

