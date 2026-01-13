-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Add columns to the existing table (assuming table name is 'ebook')
-- We use IF NOT EXISTS to avoid errors on re-run, but for columns we check manually or just try
ALTER TABLE ebook ADD COLUMN IF NOT EXISTS work_key text;
ALTER TABLE ebook ADD COLUMN IF NOT EXISTS title_norm text;
ALTER TABLE ebook ADD COLUMN IF NOT EXISTS author_norm text;
ALTER TABLE ebook ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- 3. Create indexes
-- Index for exact grouping
CREATE INDEX IF NOT EXISTS idx_ebook_work_key ON ebook(work_key);

-- Index for Full Text Search
CREATE INDEX IF NOT EXISTS idx_ebook_search_tsv ON ebook USING GIN(search_tsv);

-- Indexes for Trigram search (fallback/typo fix) logic
CREATE INDEX IF NOT EXISTS idx_ebook_title_norm_trgm ON ebook USING GIN(title_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ebook_author_norm_trgm ON ebook USING GIN(author_norm gin_trgm_ops);

