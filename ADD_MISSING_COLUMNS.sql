-- ============================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- Run this in Supabase Dashboard → SQL Editor
-- This adds the latest schema changes to existing tables
-- ============================================

-- 1. Add exampleAnswer to InterviewAnswer
DO $$ BEGIN
    ALTER TABLE "InterviewAnswer" ADD COLUMN IF NOT EXISTS "exampleAnswer" TEXT;
    RAISE NOTICE 'Added exampleAnswer to InterviewAnswer';
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'exampleAnswer already exists in InterviewAnswer';
    WHEN undefined_table THEN RAISE NOTICE 'InterviewAnswer table does not exist';
END $$;

-- 2. Add subtopics and suggestedProjects to CareerTask
DO $$ BEGIN
    ALTER TABLE "CareerTask" ADD COLUMN IF NOT EXISTS "subtopics" JSONB;
    RAISE NOTICE 'Added subtopics to CareerTask';
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'subtopics already exists in CareerTask';
    WHEN undefined_table THEN RAISE NOTICE 'CareerTask table does not exist';
END $$;

DO $$ BEGIN
    ALTER TABLE "CareerTask" ADD COLUMN IF NOT EXISTS "suggestedProjects" JSONB;
    RAISE NOTICE 'Added suggestedProjects to CareerTask';
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'suggestedProjects already exists in CareerTask';
    WHEN undefined_table THEN RAISE NOTICE 'CareerTask table does not exist';
END $$;

-- 3. Add errorMessage to Document
DO $$ BEGIN
    ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
    RAISE NOTICE 'Added errorMessage to Document';
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'errorMessage already exists in Document';
    WHEN undefined_table THEN RAISE NOTICE 'Document table does not exist';
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify the columns were added
-- ============================================

-- Check InterviewAnswer columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'InterviewAnswer'
ORDER BY ordinal_position;

-- Check CareerTask columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'CareerTask'
ORDER BY ordinal_position;

-- Check Document columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Document'
ORDER BY ordinal_position;

