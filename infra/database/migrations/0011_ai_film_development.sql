-- Migration 0011_ai_film_development.sql
-- Sprint 27: AI Film Development and Pitches (Gate G6 Exit)

-- 1. AI Coverage Reports: Comprehensive script evaluation, ratings, strengths, weaknesses, scene citations, and human oversight
CREATE TABLE IF NOT EXISTS ai_coverage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  manifest_id uuid REFERENCES ai_content_manifests(id) ON DELETE SET NULL,
  analyst_user_id uuid REFERENCES users(id),
  model_provenance jsonb NOT NULL,
  logline text NOT NULL,
  synopsis text NOT NULL,
  premise_rating real NOT NULL CHECK (premise_rating >= 1.0 AND premise_rating <= 10.0),
  character_rating real NOT NULL CHECK (character_rating >= 1.0 AND character_rating <= 10.0),
  dialogue_rating real NOT NULL CHECK (dialogue_rating >= 1.0 AND dialogue_rating <= 10.0),
  pacing_rating real NOT NULL CHECK (pacing_rating >= 1.0 AND pacing_rating <= 10.0),
  commercial_viability_rating real NOT NULL CHECK (commercial_viability_rating >= 1.0 AND commercial_viability_rating <= 10.0),
  overall_recommendation text NOT NULL CHECK (overall_recommendation IN ('pass', 'consider', 'recommend')),
  strengths text[] NOT NULL DEFAULT '{}',
  weaknesses text[] NOT NULL DEFAULT '{}',
  scene_citations jsonb NOT NULL DEFAULT '[]',
  harm_eval_status text NOT NULL DEFAULT 'passed' CHECK (harm_eval_status IN ('passed', 'flagged', 'waived')),
  harm_eval_notes text,
  human_reviewer_id uuid REFERENCES users(id),
  human_review_status text NOT NULL DEFAULT 'unreviewed' CHECK (human_review_status IN ('unreviewed', 'accepted', 'amended', 'rejected')),
  human_review_notes text,
  language text NOT NULL DEFAULT 'te-IN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. AI Pitch Packages: Loglines, tones, comps, character hooks, and budget tiering
CREATE TABLE IF NOT EXISTS ai_pitch_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  title text NOT NULL,
  logline text NOT NULL,
  tone_and_genre text NOT NULL,
  target_audience text NOT NULL,
  comparable_films text[] NOT NULL DEFAULT '{}',
  character_breakdowns jsonb NOT NULL DEFAULT '[]',
  act_summaries jsonb NOT NULL DEFAULT '[]',
  visual_palette_notes text,
  budget_tier text NOT NULL CHECK (budget_tier IN ('micro', 'low', 'mid', 'high', 'tentpole')),
  model_provenance jsonb NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]',
  human_review_status text NOT NULL DEFAULT 'draft' CHECK (human_review_status IN ('draft', 'reviewed', 'director_approved', 'producer_ready')),
  reviewed_by uuid REFERENCES users(id),
  language text NOT NULL DEFAULT 'te-IN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable Row-Level Security
ALTER TABLE ai_coverage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pitch_packages ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY ai_coverage_member_read ON ai_coverage_reports FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY ai_coverage_member_write ON ai_coverage_reports FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY ai_pitch_member_read ON ai_pitch_packages FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY ai_pitch_member_write ON ai_pitch_packages FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS ai_coverage_film_idx ON ai_coverage_reports (film_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_coverage_doc_idx ON ai_coverage_reports (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_coverage_review_idx ON ai_coverage_reports (film_id, human_review_status);
CREATE INDEX IF NOT EXISTS ai_pitch_film_idx ON ai_pitch_packages (film_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_pitch_review_idx ON ai_pitch_packages (film_id, human_review_status);
