-- Add UserJobMatch table for caching match results
-- This avoids recalculating matches every time a user refreshes

CREATE TABLE IF NOT EXISTS "UserJobMatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL, -- References JobAnalysis.id
  "matchScore" INTEGER NOT NULL,
  "skillMatchScore" INTEGER NOT NULL,
  "titleMatchScore" INTEGER NOT NULL,
  "vectorSimilarity" DOUBLE PRECISION NOT NULL,
  "experienceMatch" BOOLEAN NOT NULL,
  "educationMatch" BOOLEAN NOT NULL,
  "languageMatch" BOOLEAN NOT NULL,
  "matchExplanation" JSONB NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserJobMatch_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on userId + jobId
CREATE UNIQUE INDEX IF NOT EXISTS "UserJobMatch_userId_jobId_key" 
ON "UserJobMatch"("userId", "jobId");

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "UserJobMatch_userId_idx" ON "UserJobMatch"("userId");
CREATE INDEX IF NOT EXISTS "UserJobMatch_jobId_idx" ON "UserJobMatch"("jobId");
CREATE INDEX IF NOT EXISTS "UserJobMatch_matchScore_idx" ON "UserJobMatch"("matchScore");
CREATE INDEX IF NOT EXISTS "UserJobMatch_calculatedAt_idx" ON "UserJobMatch"("calculatedAt");

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'UserJobMatch_userId_fkey'
  ) THEN
    ALTER TABLE "UserJobMatch" ADD CONSTRAINT "UserJobMatch_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'UserJobMatch_jobId_fkey'
  ) THEN
    ALTER TABLE "UserJobMatch" ADD CONSTRAINT "UserJobMatch_jobId_fkey" 
    FOREIGN KEY ("jobId") REFERENCES "JobAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add trigger to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_userjobmatch_updated_at 
BEFORE UPDATE ON "UserJobMatch"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


