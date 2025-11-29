-- Job Matching System Schema Migration (Safe Version)
-- This version checks for existing constraints/indexes before creating them
-- Safe to run multiple times

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Remove old MarketInsight table (if exists)
DROP TABLE IF EXISTS "MarketInsight";

-- Create Job table (raw job data from scraping)
CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL,
  "externalId" TEXT,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "location" TEXT,
  "country" TEXT NOT NULL DEFAULT 'fi',
  "descriptionRaw" TEXT NOT NULL,
  "url" TEXT,
  "postedDate" TIMESTAMP(3),
  "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "salaryMin" INTEGER,
  "salaryMax" INTEGER,
  "salaryCurrency" TEXT,
  "jobType" TEXT[],
  "experienceLevel" TEXT,
  "role" TEXT,
  "isProcessed" BOOLEAN NOT NULL DEFAULT false,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- Create unique index on externalId (safe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Job' AND column_name = 'externalId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'Job_externalId_key'
  ) THEN
    CREATE UNIQUE INDEX "Job_externalId_key" ON "Job"("externalId");
  END IF;
END $$;

-- Create indexes for Job (safe)
CREATE INDEX IF NOT EXISTS "Job_country_location_idx" ON "Job"("country", "location");
CREATE INDEX IF NOT EXISTS "Job_postedDate_idx" ON "Job"("postedDate");
CREATE INDEX IF NOT EXISTS "Job_scrapedAt_idx" ON "Job"("scrapedAt");
CREATE INDEX IF NOT EXISTS "Job_isProcessed_idx" ON "Job"("isProcessed");
CREATE INDEX IF NOT EXISTS "Job_role_idx" ON "Job"("role");
CREATE INDEX IF NOT EXISTS "Job_country_role_postedDate_idx" ON "Job"("country", "role", "postedDate");

-- Create JobAnalysis table (processed job data with embeddings)
CREATE TABLE IF NOT EXISTS "JobAnalysis" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "mustHaveSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "niceToHaveSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "experienceYears" INTEGER,
  "educationLevel" TEXT,
  "languageRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "analysisEmbedding" vector(1536),
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobAnalysis_pkey" PRIMARY KEY ("id")
);

-- Create unique index on jobId (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'JobAnalysis_jobId_key'
  ) THEN
    CREATE UNIQUE INDEX "JobAnalysis_jobId_key" ON "JobAnalysis"("jobId");
  END IF;
END $$;

-- Create index on jobId (safe)
CREATE INDEX IF NOT EXISTS "JobAnalysis_jobId_idx" ON "JobAnalysis"("jobId");

-- Create vector index for similarity search (using HNSW for performance) - safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'JobAnalysis' AND column_name = 'analysisEmbedding'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'JobAnalysis_analysisEmbedding_idx'
  ) THEN
    CREATE INDEX "JobAnalysis_analysisEmbedding_idx" 
    ON "JobAnalysis" 
    USING hnsw ("analysisEmbedding" vector_cosine_ops);
  END IF;
END $$;

-- Add foreign key (safe - check if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'JobAnalysis_jobId_fkey'
  ) THEN
    ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_jobId_fkey" 
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Create MarketTrends table (aggregated market statistics)
CREATE TABLE IF NOT EXISTS "MarketTrends" (
  "id" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'fi',
  "location" TEXT,
  "role" TEXT,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "totalJobs" INTEGER NOT NULL DEFAULT 0,
  "averageExperience" DOUBLE PRECISION,
  "topMustHaveSkills" JSONB NOT NULL,
  "topNiceToHaveSkills" JSONB NOT NULL,
  "salaryStats" JSONB,
  "companyStats" JSONB,
  "roleDistribution" JSONB,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketTrends_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'market_trends_unique'
  ) THEN
    CREATE UNIQUE INDEX "market_trends_unique" 
    ON "MarketTrends"("country", "location", "role", "periodStart");
  END IF;
END $$;

-- Create indexes for MarketTrends (safe)
CREATE INDEX IF NOT EXISTS "MarketTrends_country_location_idx" ON "MarketTrends"("country", "location");
CREATE INDEX IF NOT EXISTS "MarketTrends_role_idx" ON "MarketTrends"("role");
CREATE INDEX IF NOT EXISTS "MarketTrends_calculatedAt_idx" ON "MarketTrends"("calculatedAt");

-- Add CV embedding column to Resume table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Resume' AND column_name = 'cvEmbedding'
  ) THEN
    ALTER TABLE "Resume" ADD COLUMN "cvEmbedding" vector(1536);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Resume' AND column_name = 'extractedSkills'
  ) THEN
    ALTER TABLE "Resume" ADD COLUMN "extractedSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Resume' AND column_name = 'yearsOfExperience'
  ) THEN
    ALTER TABLE "Resume" ADD COLUMN "yearsOfExperience" INTEGER;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Resume' AND column_name = 'educationLevel'
  ) THEN
    ALTER TABLE "Resume" ADD COLUMN "educationLevel" TEXT;
  END IF;
END $$;

-- Create vector index for Resume CV embeddings (if column exists) - safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Resume' AND column_name = 'cvEmbedding'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'Resume_cvEmbedding_idx'
  ) THEN
    CREATE INDEX "Resume_cvEmbedding_idx" 
    ON "Resume" 
    USING hnsw ("cvEmbedding" vector_cosine_ops);
  END IF;
END $$;

-- Add index on Resume extractedSkills (safe)
CREATE INDEX IF NOT EXISTS "Resume_extractedSkills_idx" ON "Resume" USING GIN ("extractedSkills");

