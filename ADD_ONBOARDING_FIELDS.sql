-- Add onboarding fields to User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "currentPosition" TEXT,
ADD COLUMN IF NOT EXISTS "currentSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "onboardingResumeId" TEXT,
ADD COLUMN IF NOT EXISTS "yearsOfExperience" INTEGER,
ADD COLUMN IF NOT EXISTS "industry" TEXT;

-- Add requiredSkills to InterviewSession table
ALTER TABLE "InterviewSession"
ADD COLUMN IF NOT EXISTS "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS "User_hasCompletedOnboarding_idx" ON "User"("hasCompletedOnboarding");
CREATE INDEX IF NOT EXISTS "User_onboardingResumeId_idx" ON "User"("onboardingResumeId");

-- Note: If you want to add foreign key constraint for onboardingResumeId:
-- ALTER TABLE "User" 
-- ADD CONSTRAINT "User_onboardingResumeId_fkey" 
-- FOREIGN KEY ("onboardingResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL;

