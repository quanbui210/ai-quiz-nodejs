-- Migration: Add support for multiple documents per chat session
-- This creates a many-to-many relationship between ChatSession and Document

-- Create join table for ChatSession and Document (many-to-many)
CREATE TABLE IF NOT EXISTS "ChatSessionDocument" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatSessionDocument_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint to prevent duplicate document-session pairs
CREATE UNIQUE INDEX IF NOT EXISTS "ChatSessionDocument_sessionId_documentId_key" 
ON "ChatSessionDocument"("sessionId", "documentId");

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "ChatSessionDocument_sessionId_idx" 
ON "ChatSessionDocument"("sessionId");

CREATE INDEX IF NOT EXISTS "ChatSessionDocument_documentId_idx" 
ON "ChatSessionDocument"("documentId");

-- Add foreign key constraints
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ChatSessionDocument_sessionId_fkey'
  ) THEN
    ALTER TABLE "ChatSessionDocument" 
    ADD CONSTRAINT "ChatSessionDocument_sessionId_fkey" 
    FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ChatSessionDocument_documentId_fkey'
  ) THEN
    ALTER TABLE "ChatSessionDocument" 
    ADD CONSTRAINT "ChatSessionDocument_documentId_fkey" 
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Migrate existing data: If a ChatSession has a documentId, create a ChatSessionDocument entry
INSERT INTO "ChatSessionDocument" ("id", "sessionId", "documentId", "createdAt")
SELECT 
  gen_random_uuid()::text as "id",
  cs."id" as "sessionId",
  cs."documentId" as "documentId",
  cs."createdAt" as "createdAt"
FROM "ChatSession" cs
WHERE cs."documentId" IS NOT NULL
ON CONFLICT ("sessionId", "documentId") DO NOTHING;

-- Note: We keep the documentId field in ChatSession for backward compatibility
-- but new sessions should use the ChatSessionDocument join table

