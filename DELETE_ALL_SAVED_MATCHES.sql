-- ============================================
-- DELETE ALL SAVED JOB MATCHES
-- ============================================
-- This script deletes all UserJobMatch records from the database.
-- This is needed after changing from auto-matching to on-demand matching.
--
-- WARNING: This will permanently delete ALL saved matches.
-- Users will need to re-match jobs using the new on-demand system.
-- ============================================

-- Step 1: Check current count (optional - for verification)
-- ============================================
SELECT COUNT(*) as total_matches FROM "UserJobMatch";

-- Step 2: View sample matches (optional - for verification)
-- ============================================
-- Uncomment to see a sample of what will be deleted:
-- SELECT 
--   id,
--   "userId",
--   "jobId",
--   "matchScore",
--   "calculatedAt",
--   "applicationStatus"
-- FROM "UserJobMatch"
-- ORDER BY "calculatedAt" DESC
-- LIMIT 10;

-- Step 3: Delete all saved matches
-- ============================================
-- This will delete ALL UserJobMatch records.
-- The cascade delete is already handled by Prisma relations,
-- so this is safe to run.
DELETE FROM "UserJobMatch";

-- Step 4: Verify deletion (optional - for verification)
-- ============================================
-- After running the DELETE, verify with:
-- SELECT COUNT(*) as remaining_matches FROM "UserJobMatch";
-- Should return 0

-- ============================================
-- Notes:
-- ============================================
-- - This does NOT delete Job or JobAnalysis records
-- - This does NOT delete User records
-- - Only UserJobMatch records are deleted
-- - Users can re-match jobs using POST /api/jobs/:jobId/match (costs 4 credits)
-- - Old matches were auto-generated, new matches are on-demand
-- ============================================

