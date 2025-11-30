-- Migration: Add missing fields and tables from production schema
-- Run this in your SQL editor to sync with production schema

-- ============================================
-- 1. Add missing fields to User table
-- ============================================
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "hasCompletedOnboarding" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "currentPosition" TEXT,
ADD COLUMN IF NOT EXISTS "targetRole" TEXT,
ADD COLUMN IF NOT EXISTS "currentSkills" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "onboardingResumeId" TEXT,
ADD COLUMN IF NOT EXISTS "yearsOfExperience" INTEGER,
ADD COLUMN IF NOT EXISTS "industry" TEXT;

-- ============================================
-- 2. Add missing fields to Resume table
-- ============================================
ALTER TABLE "Resume"
ADD COLUMN IF NOT EXISTS "cvEmbedding" vector(1536),
ADD COLUMN IF NOT EXISTS "extractedSkills" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "yearsOfExperience" INTEGER,
ADD COLUMN IF NOT EXISTS "educationLevel" TEXT;

-- ============================================
-- 3. Add missing fields to InterviewSession table
-- ============================================
ALTER TABLE "InterviewSession"
ADD COLUMN IF NOT EXISTS "requiredSkills" TEXT[] DEFAULT '{}';

-- ============================================
-- 4. Add missing fields to CareerGoal table
-- ============================================
ALTER TABLE "CareerGoal"
ADD COLUMN IF NOT EXISTS "targetCountryCode" TEXT,
ADD COLUMN IF NOT EXISTS "targetLocation" TEXT,
ADD COLUMN IF NOT EXISTS "jobMarketInsights" JSONB,
ADD COLUMN IF NOT EXISTS "jobMarketUpdatedAt" TIMESTAMP;

-- ============================================
-- 5. Create Job table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "externalId" TEXT UNIQUE,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "companyLogoUrl" TEXT,
  "location" TEXT,
  "country" TEXT NOT NULL DEFAULT 'fi',
  "descriptionRaw" TEXT NOT NULL,
  "url" TEXT,
  "postedDate" TIMESTAMP,
  "scrapedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "salaryMin" INTEGER,
  "salaryMax" INTEGER,
  "salaryCurrency" TEXT,
  "jobType" TEXT[] DEFAULT '{}',
  "experienceLevel" TEXT,
  "role" TEXT,
  "isProcessed" BOOLEAN NOT NULL DEFAULT false,
  "processedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Job_country_location_idx" ON "Job"("country", "location");
CREATE INDEX IF NOT EXISTS "Job_postedDate_idx" ON "Job"("postedDate");
CREATE INDEX IF NOT EXISTS "Job_scrapedAt_idx" ON "Job"("scrapedAt");
CREATE INDEX IF NOT EXISTS "Job_isProcessed_idx" ON "Job"("isProcessed");
CREATE INDEX IF NOT EXISTS "Job_role_idx" ON "Job"("role");
CREATE INDEX IF NOT EXISTS "Job_country_role_postedDate_idx" ON "Job"("country", "role", "postedDate");

-- ============================================
-- 6. Create JobAnalysis table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS "JobAnalysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL UNIQUE,
  "mustHaveSkills" TEXT[] DEFAULT '{}',
  "niceToHaveSkills" TEXT[] DEFAULT '{}',
  "experienceYears" INTEGER,
  "educationLevel" TEXT,
  "languageRequirements" TEXT[] DEFAULT '{}',
  "analysisEmbedding" vector(1536),
  "processedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "JobAnalysis_jobId_idx" ON "JobAnalysis"("jobId");

-- Create vector index for similarity search (requires pgvector extension)
CREATE INDEX IF NOT EXISTS "JobAnalysis_analysisEmbedding_idx" 
ON "JobAnalysis" USING ivfflat ("analysisEmbedding" vector_cosine_ops)
WITH (lists = 100);

-- ============================================
-- 7. Create UserJobMatch table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS "UserJobMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "matchScore" INTEGER NOT NULL,
  "skillMatchScore" INTEGER NOT NULL,
  "titleMatchScore" INTEGER NOT NULL,
  "vectorSimilarity" DOUBLE PRECISION NOT NULL,
  "experienceMatch" BOOLEAN NOT NULL,
  "educationMatch" BOOLEAN NOT NULL,
  "languageMatch" BOOLEAN NOT NULL,
  "matchExplanation" JSONB NOT NULL,
  "calculatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserJobMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "UserJobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobAnalysis"("jobId") ON DELETE CASCADE,
  CONSTRAINT "UserJobMatch_userId_jobId_key" UNIQUE ("userId", "jobId")
);

CREATE INDEX IF NOT EXISTS "UserJobMatch_userId_idx" ON "UserJobMatch"("userId");
CREATE INDEX IF NOT EXISTS "UserJobMatch_jobId_idx" ON "UserJobMatch"("jobId");
CREATE INDEX IF NOT EXISTS "UserJobMatch_matchScore_idx" ON "UserJobMatch"("matchScore");
CREATE INDEX IF NOT EXISTS "UserJobMatch_calculatedAt_idx" ON "UserJobMatch"("calculatedAt");

-- ============================================
-- 8. Create MarketTrends table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS "MarketTrends" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "country" TEXT NOT NULL DEFAULT 'fi',
  "location" TEXT,
  "role" TEXT,
  "periodStart" TIMESTAMP NOT NULL,
  "periodEnd" TIMESTAMP NOT NULL,
  "totalJobs" INTEGER NOT NULL DEFAULT 0,
  "averageExperience" DOUBLE PRECISION,
  "topMustHaveSkills" JSONB NOT NULL,
  "topNiceToHaveSkills" JSONB NOT NULL,
  "salaryStats" JSONB,
  "companyStats" JSONB,
  "roleDistribution" JSONB,
  "aiAnalysis" JSONB,
  "calculatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_trends_unique" UNIQUE ("country", "location", "role", "periodStart")
);

CREATE INDEX IF NOT EXISTS "MarketTrends_country_location_idx" ON "MarketTrends"("country", "location");
CREATE INDEX IF NOT EXISTS "MarketTrends_role_idx" ON "MarketTrends"("role");
CREATE INDEX IF NOT EXISTS "MarketTrends_calculatedAt_idx" ON "MarketTrends"("calculatedAt");

-- ============================================
-- 9. Add relation from User to UserJobMatch
-- ============================================
-- Note: Foreign key constraint already created above in UserJobMatch table

-- ============================================
-- 10. Ensure pgvector extension is enabled
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Verification queries (run these to check)
-- ============================================
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'User' AND column_name IN ('hasCompletedOnboarding', 'currentPosition', 'targetRole', 'currentSkills', 'onboardingResumeId', 'yearsOfExperience', 'industry');

-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'Resume' AND column_name IN ('cvEmbedding', 'extractedSkills', 'yearsOfExperience', 'educationLevel');

-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('Job', 'JobAnalysis', 'UserJobMatch', 'MarketTrends');

