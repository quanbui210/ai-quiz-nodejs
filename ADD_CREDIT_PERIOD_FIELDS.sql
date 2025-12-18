-- Add separate credit reset period fields
-- These are independent of subscription billing period
-- Subscription billing: currentPeriodStart/End (from Stripe, can be 1 year for annual)
-- Credit reset: creditPeriodStart/End (monthly, every 30 days)

ALTER TABLE "UserSubscription"
ADD COLUMN IF NOT EXISTS "creditPeriodStart" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "creditPeriodEnd" TIMESTAMP(3);

-- Initialize credit period for existing users
-- Set to 30 days from now if not set
UPDATE "UserSubscription"
SET 
    "creditPeriodStart" = COALESCE("creditPeriodStart", NOW()),
    "creditPeriodEnd" = COALESCE("creditPeriodEnd", NOW() + INTERVAL '30 days')
WHERE "creditPeriodStart" IS NULL OR "creditPeriodEnd" IS NULL;

-- Note: currentPeriodStart/End remain for subscription billing (from Stripe)
-- creditPeriodStart/End are for monthly credit resets (independent of billing)

