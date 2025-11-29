-- Adds MarketInsight table for caching job market insights
-- This prevents expensive API calls (Apify/Adzuna) and AI analysis on every request

CREATE TABLE IF NOT EXISTS "MarketInsight" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "location" TEXT,
  "country" TEXT NOT NULL,
  "currentPosition" TEXT,
  "currentSkillsHash" TEXT,
  "rawData" JSONB NOT NULL,
  "analysis" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketInsight_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for cache key
CREATE UNIQUE INDEX IF NOT EXISTS "market_insight_unique" ON "MarketInsight"("role", "location", "country", "currentPosition", "currentSkillsHash");

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS "MarketInsight_role_location_country_idx" ON "MarketInsight"("role", "location", "country");
CREATE INDEX IF NOT EXISTS "MarketInsight_fetchedAt_idx" ON "MarketInsight"("fetchedAt");

-- Optional: Add a cleanup job to remove old cache entries (older than 30 days)
-- This can be run periodically via a cron job or scheduled task
-- DELETE FROM "MarketInsight" WHERE "fetchedAt" < NOW() - INTERVAL '30 days';

