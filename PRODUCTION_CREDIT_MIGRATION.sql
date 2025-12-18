-- ============================================
-- CREDIT SYSTEM MIGRATION FOR PRODUCTION
-- ============================================
-- This script adds credit-based pricing system to production database
-- Run this in your production database SQL editor
-- ============================================

-- Step 1: Create CreditTransactionType enum
-- ============================================
DO $$ BEGIN
    CREATE TYPE "CreditTransactionType" AS ENUM (
        'MONTHLY_ALLOCATION',
        'PURCHASE',
        'USAGE',
        'REFUND',
        'ADMIN_ADJUSTMENT',
        'ROLLOVER',
        'BONUS'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add credit fields to UserSubscription table
-- ============================================
ALTER TABLE "UserSubscription"
ADD COLUMN IF NOT EXISTS "creditsPerMonth" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS "currentCredits" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS "totalCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "creditsUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "maxRolloverCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "creditPeriodStart" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "creditPeriodEnd" TIMESTAMP(3);

-- Step 3: Create CreditTransaction table
-- ============================================
CREATE TABLE IF NOT EXISTS "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- Step 4: Create CreditPricing table
-- ============================================
CREATE TABLE IF NOT EXISTS "CreditPricing" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPricing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditPricing_feature_key" UNIQUE ("feature")
);

-- Step 5: Add foreign key constraint for CreditTransaction
-- ============================================
DO $$ BEGIN
    ALTER TABLE "CreditTransaction"
    ADD CONSTRAINT "CreditTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 6: Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS "CreditTransaction_userId_createdAt_idx" 
    ON "CreditTransaction"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CreditTransaction_type_idx" 
    ON "CreditTransaction"("type");

CREATE INDEX IF NOT EXISTS "CreditPricing_feature_isActive_idx" 
    ON "CreditPricing"("feature", "isActive");

-- Step 7: Initialize credit fields for existing subscriptions
-- ============================================
-- This sets default credits based on plan name
-- Free plans: 50 credits/month, 0 rollover
-- Pro plans: 100 credits/month, 50 rollover
-- Premium plans: 200 credits/month, 100 rollover

UPDATE "UserSubscription" us
SET 
    "creditsPerMonth" = CASE
        WHEN LOWER(p.name) IN ('premium', 'premium plan') THEN 200
        WHEN LOWER(p.name) IN ('pro', 'pro plan') THEN 100
        ELSE 50
    END,
    "currentCredits" = CASE
        WHEN LOWER(p.name) IN ('premium', 'premium plan') THEN 200
        WHEN LOWER(p.name) IN ('pro', 'pro plan') THEN 100
        ELSE 50
    END,
    "maxRolloverCredits" = CASE
        WHEN LOWER(p.name) IN ('premium', 'premium plan') THEN 100
        WHEN LOWER(p.name) IN ('pro', 'pro plan') THEN 50
        ELSE 0
    END,
    "totalCreditsUsed" = 0,
    "creditsUsedThisMonth" = 0,
    -- Initialize credit reset period (monthly, independent of subscription billing)
    "creditPeriodStart" = COALESCE(us."creditPeriodStart", NOW()),
    "creditPeriodEnd" = COALESCE(us."creditPeriodEnd", NOW() + INTERVAL '30 days')
FROM "SubscriptionPlan" p
WHERE us."planId" = p.id
    AND (us."creditsPerMonth" = 0 OR us."creditsPerMonth" IS NULL);

-- Step 8: Seed default credit pricing
-- ============================================
-- Note: Run the seed-credit-pricing.ts script after this migration
-- This is just a backup SQL version

INSERT INTO "CreditPricing" ("id", "feature", "creditCost", "description", "isActive", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'quiz_generation', 2, 'Generate a quiz with multiple questions', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'document_analysis', 3, 'Analyze and extract insights from a document', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'job_matching', 5, 'Match your profile with 20+ job postings', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'skill_mastery_roadmap', 5, 'Generate a skill mastery learning roadmap', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'career_roadmap', 8, 'Generate a comprehensive career transition roadmap', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'interview_session', 5, 'Interactive AI interview practice session', true, NOW(), NOW())
ON CONFLICT ("feature") DO UPDATE SET
    "creditCost" = EXCLUDED."creditCost",
    "description" = EXCLUDED."description",
    "isActive" = EXCLUDED."isActive",
    "updatedAt" = NOW();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Next steps:
-- 1. Verify all tables and columns were created
-- 2. Run: npx prisma generate (to regenerate Prisma client with new fields)
-- 3. Run: npx tsx src/scripts/production-seed-credit-pricing.ts
-- 4. Run: npx tsx src/scripts/production-migrate-credits.ts
-- 5. Verify credit allocations are correct for all users
-- 6. Restart your application (cron jobs will start automatically)
-- ============================================

