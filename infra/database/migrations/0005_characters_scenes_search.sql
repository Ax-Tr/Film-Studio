-- Migration 0005_characters_scenes_search.sql
-- Sprint 11: Web characters, scene board, and Unicode-aware search

-- 1. Extend characters table with aliases, primary voice, traits, and arc summary
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS voice_traits jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(voice_traits) = 'object'),
  ADD COLUMN IF NOT EXISTS arc_summary text;

-- 2. Character relationships
CREATE TABLE IF NOT EXISTS character_relationships (
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  source_character_id uuid NOT NULL,
  target_character_id uuid NOT NULL,
  relationship_type text NOT NULL CHECK (length(trim(relationship_type)) BETWEEN 1 AND 100),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, source_character_id, target_character_id),
  CHECK (source_character_id <> target_character_id),
  FOREIGN KEY (film_id, source_character_id)
    REFERENCES characters(film_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, target_character_id)
    REFERENCES characters(film_id, id) ON DELETE CASCADE
);

-- 3. Scene metadata enhancements: slugline, heading, time_of_day, location, summary, lock
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS slugline text,
  ADD COLUMN IF NOT EXISTS time_of_day text,
  ADD COLUMN IF NOT EXISTS setting_location text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- 4. Materialized scene-character appearances and dialogue count projections
CREATE TABLE IF NOT EXISTS scene_character_appearances (
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  character_id uuid NOT NULL,
  dialogue_block_count integer NOT NULL DEFAULT 0 CHECK (dialogue_block_count >= 0),
  dialogue_word_count integer NOT NULL DEFAULT 0 CHECK (dialogue_word_count >= 0),
  PRIMARY KEY (film_id, scene_id, character_id),
  FOREIGN KEY (film_id, document_id, scene_id)
    REFERENCES scenes(film_id, document_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, character_id)
    REFERENCES characters(film_id, id) ON DELETE CASCADE
);

-- 5. RLS policies for new tables
ALTER TABLE character_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_character_appearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY character_relationships_member_read ON character_relationships FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY character_relationships_editor_write ON character_relationships FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY scene_character_appearances_member_read ON scene_character_appearances FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY scene_character_appearances_editor_write ON scene_character_appearances FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 6. Indexes for fast Unicode search and relationship lookups
CREATE INDEX IF NOT EXISTS character_relationships_target_idx
  ON character_relationships (film_id, target_character_id);

CREATE INDEX IF NOT EXISTS scene_character_appearances_char_idx
  ON scene_character_appearances (film_id, character_id);

CREATE INDEX IF NOT EXISTS scenes_slugline_trgm_idx
  ON scenes (film_id, slugline) WHERE deleted_at IS NULL;

