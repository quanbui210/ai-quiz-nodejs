-- Migration: Add pageCount field to Document and Resume tables
-- This allows storing the actual page count from PDF documents for accurate ATS hygiene reports

-- Add pageCount to Document table
ALTER TABLE "Document" 
ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;

-- Add pageCount to Resume table
ALTER TABLE "Resume" 
ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN "Document"."pageCount" IS 'Number of pages in the document (for PDFs)';
COMMENT ON COLUMN "Resume"."pageCount" IS 'Number of pages in the resume PDF';

