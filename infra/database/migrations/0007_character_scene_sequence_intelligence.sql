-- Migration 0007_character_scene_sequence_intelligence.sql
-- Sprint 23: Character, Scene, and Sequence Intelligence

-- 1. Extend sequences table (originally created in 0002_canonical_content.sql)
ALTER TABLE sequences
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS dramatic_purpose text,
  ADD COLUMN IF NOT EXISTS act_number integer NOT NULL DEFAULT 1 CHECK (act_number BETWEEN 1 AND 5);

-- 2. Extend scenes with intelligence fields (purpose, tone, emotional polarity, status, tags, notes)
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS dramatic_purpose text,
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS emotional_polarity text CHECK (emotional_polarity IS NULL OR emotional_polarity IN ('positive', 'negative', 'neutral', 'ambivalent', 'shift_pos_to_neg', 'shift_neg_to_pos')),
  ADD COLUMN IF NOT EXISTS scene_status text NOT NULL DEFAULT 'draft' CHECK (scene_status IN ('idea', 'outline', 'draft', 'revised', 'locked')),
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text;

-- 3. Character Arcs, Dialects, and Voice Profiles
CREATE TABLE IF NOT EXISTS character_arcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  character_id uuid NOT NULL,
  starting_state text,
  transformation_catalyst text,
  climax_choice text,
  resolution_state text,
  flaw text,
  internal_need text,
  external_goal text,
  dialect_profile text,
  voice_rhythm text,
  vocabulary_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, character_id),
  FOREIGN KEY (film_id, character_id)
    REFERENCES characters(film_id, id) ON DELETE CASCADE
);

-- 4. Enable Row Level Security on character_arcs (sequences and scenes already have RLS enabled)
ALTER TABLE character_arcs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Character Arcs
CREATE POLICY character_arcs_member_read ON character_arcs FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY character_arcs_member_write ON character_arcs FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.characters.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.characters.edit')
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS character_arcs_film_char_idx ON character_arcs (film_id, character_id);
CREATE INDEX IF NOT EXISTS sequences_film_doc_pos_idx ON sequences (film_id, document_id, position);
CREATE INDEX IF NOT EXISTS scenes_sequence_idx ON scenes (film_id, sequence_id);
