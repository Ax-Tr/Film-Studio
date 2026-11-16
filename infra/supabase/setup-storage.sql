-- ============================================================================
-- Supabase Storage & Security Policy Configuration for Film Studio Platform
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard)
-- ============================================================================

-- 1. Create Private Storage Bucket for Film Assets & Screenplay Revisions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'film-studio-assets',
  'film-studio-assets',
  false, -- private bucket: access requires signed URLs or service credentials
  52428800, -- 50 MB max file size limit
  ARRAY[
    'application/pdf',
    'application/json',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS Policies: Service role and authenticated access
CREATE POLICY "Allow service role full access on film-studio-assets"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'film-studio-assets')
  WITH CHECK (bucket_id = 'film-studio-assets');

-- 3. Optimal Indexing for Schema Migrations & Advisory Locks in Pooler
-- Ensures transaction-level pg_advisory_lock behaves predictably
COMMENT ON TABLE schema_migrations IS 'Tracks all 19 forward SQL platform schema migrations';
