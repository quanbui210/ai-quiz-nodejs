-- ============================================================================
-- Seed Test Users SQL Script
-- ============================================================================
-- 
-- IMPORTANT: This script creates Prisma User records, but you MUST first
-- create the Supabase Auth users using one of these methods:
--
-- Option 1 (Recommended): Run the TypeScript script first
--   npm run seed:test-users
--   This will create both Supabase Auth users AND Prisma records automatically.
--
-- Option 2: Create Supabase Auth users manually via Supabase Dashboard
--   Then run this SQL script to create the Prisma records.
--
-- Option 3: Get user IDs from existing Supabase Auth users
--   Run: SELECT id, email FROM auth.users WHERE email IN ('user-alpha@test.com', 'user-beta@test.com');
--   Then replace the UUIDs in this script with the actual IDs.
--
-- ============================================================================

-- Step 1: Get the default subscription plan ID
-- (This will be used for creating subscriptions)
DO $$
DECLARE
    default_plan_id TEXT;
    user_alpha_id TEXT;
    user_beta_id TEXT;
BEGIN
    -- Get default plan ID
    SELECT id INTO default_plan_id
    FROM "SubscriptionPlan"
    WHERE "isDefault" = true AND "isActive" = true
    LIMIT 1;

    IF default_plan_id IS NULL THEN
        RAISE EXCEPTION 'No default subscription plan found. Please run seed:plans first.';
    END IF;

    -- Get Supabase Auth user IDs
    -- Replace these with actual IDs from: SELECT id, email FROM auth.users WHERE email IN ('user-alpha@test.com', 'user-beta@test.com');
    SELECT id INTO user_alpha_id FROM auth.users WHERE email = 'user-alpha@test.com' LIMIT 1;
    SELECT id INTO user_beta_id FROM auth.users WHERE email = 'user-beta@test.com' LIMIT 1;

    IF user_alpha_id IS NULL THEN
        RAISE EXCEPTION 'User user-alpha@test.com not found in auth.users. Please create the Supabase Auth user first.';
    END IF;

    IF user_beta_id IS NULL THEN
        RAISE EXCEPTION 'User user-beta@test.com not found in auth.users. Please create the Supabase Auth user first.';
    END IF;

    -- Step 2: Create Prisma User records (if they don't exist)
    INSERT INTO "User" (id, email, name, "createdAt", "updatedAt")
    VALUES 
        (user_alpha_id, 'user-alpha@test.com', 'Test User Alpha', NOW(), NOW()),
        (user_beta_id, 'user-beta@test.com', 'Test User Beta', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            name = EXCLUDED.name,
            "updatedAt" = NOW();

    -- Step 3: Create UserSubscription records (if they don't exist)
    INSERT INTO "UserSubscription" (
        id, "userId", "planId", 
        "maxTopics", "maxQuizzes", "maxDocuments", 
        "maxCareerRoadmaps", "maxInterviewSessionsPerMonth", "maxResumes",
        "allowedModels", status, "createdAt", "updatedAt"
    )
    SELECT 
        gen_random_uuid(),
        u.id,
        default_plan_id,
        p."maxTopics",
        p."maxQuizzes",
        p."maxDocuments",
        p."maxCareerRoadmaps",
        p."maxInterviewSessionsPerMonth",
        p."maxResumes",
        p."allowedModels",
        'ACTIVE',
        NOW(),
        NOW()
    FROM "User" u
    CROSS JOIN "SubscriptionPlan" p
    WHERE u.email IN ('user-alpha@test.com', 'user-beta@test.com')
        AND p.id = default_plan_id
        AND NOT EXISTS (
            SELECT 1 FROM "UserSubscription" us WHERE us."userId" = u.id
        );

    -- Step 4: Create UserUsage records (if they don't exist)
    INSERT INTO "UserUsage" (
        id, "userId", 
        "topicsCount", "quizzesCount", "documentsCount",
        "careerRoadmapsCount", "interviewSessionsThisMonth", "resumesCount",
        "lastResetAt", "lastMonthReset", "createdAt", "updatedAt"
    )
    SELECT 
        gen_random_uuid(),
        u.id,
        0, 0, 0, 0, 0, 0,
        NOW(),
        NOW(),
        NOW(),
        NOW()
    FROM "User" u
    WHERE u.email IN ('user-alpha@test.com', 'user-beta@test.com')
        AND NOT EXISTS (
            SELECT 1 FROM "UserUsage" uu WHERE uu."userId" = u.id
        );

    RAISE NOTICE '✓ Test users seeded successfully!';
    RAISE NOTICE '  - user-alpha@test.com (ID: %)', user_alpha_id;
    RAISE NOTICE '  - user-beta@test.com (ID: %)', user_beta_id;
    RAISE NOTICE '  - Default plan ID: %', default_plan_id;
END $$;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the users were created correctly:
--
-- SELECT 
--     u.id,
--     u.email,
--     u.name,
--     us.status as subscription_status,
--     p.name as plan_name,
--     uu."topicsCount",
--     uu."quizzesCount"
-- FROM "User" u
-- LEFT JOIN "UserSubscription" us ON us."userId" = u.id
-- LEFT JOIN "SubscriptionPlan" p ON p.id = us."planId"
-- LEFT JOIN "UserUsage" uu ON uu."userId" = u.id
-- WHERE u.email IN ('user-alpha@test.com', 'user-beta@test.com');
--
-- ============================================================================
-- Test User Credentials
-- ============================================================================
-- Email: user-alpha@test.com
-- Password: password
--
-- Email: user-beta@test.com
-- Password: password
--
-- Login endpoint: POST /api/v1/auth/login
-- Request body: { "email": "user-alpha@test.com", "password": "password" }
-- ============================================================================

