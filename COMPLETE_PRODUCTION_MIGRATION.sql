-- ============================================
-- COMPLETE PRODUCTION SCHEMA MIGRATION
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- Step 1: Create new ENUMs
-- ============================================

-- ResumeStatus enum
DO $$ BEGIN
    CREATE TYPE "ResumeStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- InterviewLevel enum
DO $$ BEGIN
    CREATE TYPE "InterviewLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'STAFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- InterviewStatus enum
DO $$ BEGIN
    CREATE TYPE "InterviewStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ABANDONED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- QuestionCategory enum
DO $$ BEGIN
    CREATE TYPE "QuestionCategory" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'HR', 'CULTURE_FIT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Timeframe enum
DO $$ BEGIN
    CREATE TYPE "Timeframe" AS ENUM ('THREE_MONTHS', 'SIX_MONTHS', 'TWELVE_MONTHS', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- GoalStatus enum
DO $$ BEGIN
    CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TaskType enum
DO $$ BEGIN
    CREATE TYPE "TaskType" AS ENUM ('LEARNING', 'PROJECT', 'PRACTICE', 'INTERVIEW_PREP', 'CERTIFICATION', 'NETWORKING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TaskStatus enum
DO $$ BEGIN
    CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ResourceType enum
DO $$ BEGIN
    CREATE TYPE "ResourceType" AS ENUM ('COURSE', 'VIDEO', 'DOCUMENTATION', 'ARTICLE', 'BOOK', 'TUTORIAL', 'PROJECT_TEMPLATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add new columns to existing tables
-- ============================================

-- Add careerGoalId to Quiz
ALTER TABLE "Quiz" 
ADD COLUMN IF NOT EXISTS "careerGoalId" TEXT;

-- Add new limit columns to SubscriptionPlan
ALTER TABLE "SubscriptionPlan" 
ADD COLUMN IF NOT EXISTS "maxCareerRoadmaps" INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS "maxInterviewSessionsPerMonth" INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS "maxResumes" INTEGER DEFAULT 2;

-- Add new limit columns to UserSubscription
ALTER TABLE "UserSubscription"
ADD COLUMN IF NOT EXISTS "maxCareerRoadmaps" INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS "maxInterviewSessionsPerMonth" INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS "maxResumes" INTEGER DEFAULT 2;

-- Add new usage tracking columns to UserUsage
ALTER TABLE "UserUsage"
ADD COLUMN IF NOT EXISTS "careerRoadmapsCount" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "interviewSessionsThisMonth" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "resumesCount" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastMonthReset" TIMESTAMP DEFAULT NOW();

-- Add job market intelligence columns to CareerGoal
DO $$ BEGIN
    ALTER TABLE "CareerGoal"
    ADD COLUMN IF NOT EXISTS "targetCountryCode" TEXT,
    ADD COLUMN IF NOT EXISTS "targetLocation" TEXT,
    ADD COLUMN IF NOT EXISTS "jobMarketInsights" JSONB,
    ADD COLUMN IF NOT EXISTS "jobMarketUpdatedAt" TIMESTAMP;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- Step 3: Create Resume table
-- ============================================

CREATE TABLE IF NOT EXISTS "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "ResumeStatus" NOT NULL DEFAULT 'PENDING',
    "parsedText" TEXT,
    "analysisScore" DOUBLE PRECISION,
    "analysisStrengths" TEXT[],
    "analysisWeaknesses" TEXT[],
    "analysisSuggestions" JSONB,
    "analyzedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Resume_documentId_key" ON "Resume"("documentId");
CREATE INDEX IF NOT EXISTS "Resume_userId_idx" ON "Resume"("userId");

-- Step 4: Create Interview tables
-- ============================================

-- InterviewSession
CREATE TABLE IF NOT EXISTS "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "role" TEXT NOT NULL,
    "roleDescription" TEXT,
    "level" "InterviewLevel" NOT NULL,
    "yearsOfExperience" INTEGER,
    "country" TEXT,
    "industry" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "overallScore" DOUBLE PRECISION,
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "recommendations" JSONB,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InterviewSession_userId_idx" ON "InterviewSession"("userId");
CREATE INDEX IF NOT EXISTS "InterviewSession_status_idx" ON "InterviewSession"("status");

-- InterviewQuestion
CREATE TABLE IF NOT EXISTS "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "QuestionCategory" NOT NULL,
    "order" INTEGER NOT NULL,
    "aiFeedback" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InterviewQuestion_sessionId_idx" ON "InterviewQuestion"("sessionId");
CREATE INDEX IF NOT EXISTS "InterviewQuestion_order_idx" ON "InterviewQuestion"("order");

-- InterviewAnswer
CREATE TABLE IF NOT EXISTS "InterviewAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION,
    "improvementTips" TEXT,
    "exampleAnswer" TEXT,
    "starFormatScore" JSONB,
    "answeredAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InterviewAnswer_questionId_idx" ON "InterviewAnswer"("questionId");

-- InterviewNote
CREATE TABLE IF NOT EXISTS "InterviewNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InterviewNote_sessionId_idx" ON "InterviewNote"("sessionId");

-- Step 5: Create Career Goal tables
-- ============================================

-- CareerGoal
CREATE TABLE IF NOT EXISTS "CareerGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentRole" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "targetCountryCode" TEXT,
    "targetLocation" TEXT,
    "timeframe" "Timeframe" NOT NULL,
    "currentSkills" TEXT[],
    "requiredSkills" TEXT[],
    "skillGapAnalysis" JSONB,
    "roadmapPlan" JSONB,
    "jobMarketInsights" JSONB,
    "jobMarketUpdatedAt" TIMESTAMP,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP,
    "completedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CareerGoal_userId_idx" ON "CareerGoal"("userId");
CREATE INDEX IF NOT EXISTS "CareerGoal_status_idx" ON "CareerGoal"("status");

-- CareerQuizSuggestion
CREATE TABLE IF NOT EXISTS "CareerQuizSuggestion" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "suggestedQuizTitle" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "reason" TEXT NOT NULL,
    "linkedTaskTitle" TEXT,
    "linkedTaskId" TEXT,
    "phase" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerQuizSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CareerQuizSuggestion_goalId_suggestedQuizTitle_key" ON "CareerQuizSuggestion"("goalId", "suggestedQuizTitle");
CREATE INDEX IF NOT EXISTS "CareerQuizSuggestion_goalId_idx" ON "CareerQuizSuggestion"("goalId");
CREATE INDEX IF NOT EXISTS "CareerQuizSuggestion_isActive_idx" ON "CareerQuizSuggestion"("isActive");
CREATE INDEX IF NOT EXISTS "CareerQuizSuggestion_phase_idx" ON "CareerQuizSuggestion"("phase");

-- CareerTask
CREATE TABLE IF NOT EXISTS "CareerTask" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" "TaskType" NOT NULL,
    "dueDate" TIMESTAMP,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP,
    "order" INTEGER NOT NULL DEFAULT 0,
    "estimatedHours" INTEGER,
    "dependencies" TEXT[],
    "subtopics" JSONB,
    "suggestedProjects" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CareerTask_goalId_idx" ON "CareerTask"("goalId");
CREATE INDEX IF NOT EXISTS "CareerTask_status_idx" ON "CareerTask"("status");
CREATE INDEX IF NOT EXISTS "CareerTask_phase_idx" ON "CareerTask"("phase");

-- CareerResource
CREATE TABLE IF NOT EXISTS "CareerResource" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "resourceType" "ResourceType" NOT NULL,
    "description" TEXT,
    "estimatedHours" INTEGER,
    "difficulty" "Difficulty" NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerResource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CareerResource_goalId_idx" ON "CareerResource"("goalId");
CREATE INDEX IF NOT EXISTS "CareerResource_taskId_idx" ON "CareerResource"("taskId");

-- CareerMilestone
CREATE TABLE IF NOT EXISTS "CareerMilestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP NOT NULL,
    "achievedAt" TIMESTAMP,
    "isAchieved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerMilestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CareerMilestone_goalId_idx" ON "CareerMilestone"("goalId");
CREATE INDEX IF NOT EXISTS "CareerMilestone_isAchieved_idx" ON "CareerMilestone"("isAchieved");

-- Step 6: Add Foreign Key Constraints
-- ============================================

-- Resume foreign keys
DO $$ BEGIN
    ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Resume" ADD CONSTRAINT "Resume_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Quiz careerGoalId foreign key
DO $$ BEGIN
    ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_careerGoalId_fkey" FOREIGN KEY ("careerGoalId") REFERENCES "CareerGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- InterviewSession foreign keys
DO $$ BEGIN
    ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- InterviewQuestion foreign key
DO $$ BEGIN
    ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- InterviewAnswer foreign key
DO $$ BEGIN
    ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- InterviewNote foreign key
DO $$ BEGIN
    ALTER TABLE "InterviewNote" ADD CONSTRAINT "InterviewNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CareerGoal foreign key
DO $$ BEGIN
    ALTER TABLE "CareerGoal" ADD CONSTRAINT "CareerGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CareerQuizSuggestion foreign key
DO $$ BEGIN
    ALTER TABLE "CareerQuizSuggestion" ADD CONSTRAINT "CareerQuizSuggestion_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CareerGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CareerTask foreign key
DO $$ BEGIN
    ALTER TABLE "CareerTask" ADD CONSTRAINT "CareerTask_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CareerGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CareerResource foreign keys
DO $$ BEGIN
    ALTER TABLE "CareerResource" ADD CONSTRAINT "CareerResource_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CareerGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CareerResource" ADD CONSTRAINT "CareerResource_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CareerTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CareerMilestone foreign key
DO $$ BEGIN
    ALTER TABLE "CareerMilestone" ADD CONSTRAINT "CareerMilestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CareerGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 7: Add index for Quiz.careerGoalId (if needed)
-- ============================================
CREATE INDEX IF NOT EXISTS "Quiz_careerGoalId_idx" ON "Quiz"("careerGoalId");

-- Step 8: Add new columns to existing tables (latest changes)
-- ============================================

-- Add exampleAnswer to InterviewAnswer (if table exists)
DO $$ BEGIN
    ALTER TABLE "InterviewAnswer" ADD COLUMN IF NOT EXISTS "exampleAnswer" TEXT;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- Add subtopics and suggestedProjects to CareerTask (if table exists)
DO $$ BEGIN
    ALTER TABLE "CareerTask" ADD COLUMN IF NOT EXISTS "subtopics" JSONB;
    ALTER TABLE "CareerTask" ADD COLUMN IF NOT EXISTS "suggestedProjects" JSONB;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- Add errorMessage to Document (if table exists)
DO $$ BEGIN
    ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Next steps:
-- 1. Run: railway run npm run prisma:generate
-- 2. Update SubscriptionPlan records (see PRODUCTION_DEPLOYMENT.md)
-- 3. Run: railway run npm run sync:subscriptions
-- ============================================

