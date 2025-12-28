-- ============================================
-- ADD NEW FIELDS TO UserJobMatch TABLE
-- ============================================
-- This migration adds application tracking fields to UserJobMatch:
-- - userNotes: User's personal notes
-- - applicationStatus: Current application status (enum)
-- - appliedAt: When user applied
-- - interviewDate: Scheduled interview date
-- - outcome: Final outcome
--
-- Also creates ApplicationStatus enum and adds indexes.
-- ============================================

-- Step 1: Create ApplicationStatus enum
-- ============================================
DO $$ BEGIN
    CREATE TYPE "ApplicationStatus" AS ENUM (
        'VIEWED',
        'SAVED',
        'APPLIED',
        'INTERVIEW',
        'REJECTED',
        'OFFERED',
        'WITHDRAWN'
    );
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'ApplicationStatus enum already exists, skipping...';
END $$;

-- Step 2: Add new columns to UserJobMatch table
-- ============================================

-- Add userNotes column (nullable TEXT)
ALTER TABLE "UserJobMatch"
ADD COLUMN IF NOT EXISTS "userNotes" TEXT;

-- Add applicationStatus column (nullable ApplicationStatus enum)
ALTER TABLE "UserJobMatch"
ADD COLUMN IF NOT EXISTS "applicationStatus" "ApplicationStatus";

-- Add appliedAt column (nullable TIMESTAMP)
ALTER TABLE "UserJobMatch"
ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);

-- Add interviewDate column (nullable TIMESTAMP)
ALTER TABLE "UserJobMatch"
ADD COLUMN IF NOT EXISTS "interviewDate" TIMESTAMP(3);

-- Add outcome column (nullable TEXT)
ALTER TABLE "UserJobMatch"
ADD COLUMN IF NOT EXISTS "outcome" TEXT;

-- Step 3: Create indexes for performance
-- ============================================

-- Index on applicationStatus for filtering by status
CREATE INDEX IF NOT EXISTS "UserJobMatch_applicationStatus_idx" 
    ON "UserJobMatch"("applicationStatus");

-- Composite index on userId and applicationStatus for user's filtered queries
CREATE INDEX IF NOT EXISTS "UserJobMatch_userId_applicationStatus_idx" 
    ON "UserJobMatch"("userId", "applicationStatus");

-- Step 4: Verify the changes
-- ============================================
-- Uncomment to verify columns were added:
-- SELECT 
--     column_name, 
--     data_type, 
--     is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'UserJobMatch'
--     AND column_name IN ('userNotes', 'applicationStatus', 'appliedAt', 'interviewDate', 'outcome')
-- ORDER BY column_name;

-- Verify enum was created:
-- SELECT 
--     t.typname as enum_name,
--     e.enumlabel as enum_value
-- FROM pg_type t 
-- JOIN pg_enum e ON t.oid = e.enumtypid  
-- WHERE t.typname = 'ApplicationStatus'
-- ORDER BY e.enumsortorder;

-- Verify indexes were created:
-- SELECT 
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE tablename = 'UserJobMatch'
--     AND indexname IN (
--         'UserJobMatch_applicationStatus_idx',
--         'UserJobMatch_userId_applicationStatus_idx'
--     );

-- ============================================
-- Migration Complete!
-- ============================================
-- All new fields are nullable, so existing records are not affected.
-- The application can now use these fields for application tracking.
-- ============================================

