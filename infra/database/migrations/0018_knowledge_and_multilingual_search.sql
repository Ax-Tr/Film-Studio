-- Migration 0018_knowledge_and_multilingual_search.sql
-- Sprint 34: Knowledge, Advanced Search, and Multilingual Expansion (Gate G9)

-- 1. Knowledge and Multilingual Search Permissions
INSERT INTO permissions (key, description) VALUES
  ('film.knowledge.read', 'Read film knowledge assets, lore bibles, and dialect glossaries.'),
  ('film.knowledge.edit', 'Create, update, and manage film knowledge assets and dialect terms.'),
  ('film.knowledge.search', 'Perform semantic and hybrid multilingual retrieval across project knowledge.')
ON CONFLICT (key) DO NOTHING;

-- 2. Project Knowledge Assets: World lore, historical research, and dialect dictionaries
CREATE TABLE IF NOT EXISTS project_knowledge_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  category text NOT NULL CHECK (category IN (
    'historical_reference', 'mythology_lore', 'dialect_dictionary',
    'world_bible', 'visual_moodboard', 'legal_document', 'custom_reference'
  )),
  language text NOT NULL DEFAULT 'te-IN' CHECK (
    language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  content_format text NOT NULL DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'plain', 'structured_json')),
  text_content text NOT NULL CHECK (length(trim(text_content)) > 0),
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Knowledge Search Chunks: Embeddings and tsvector for hybrid search with deletion cascade
CREATE TABLE IF NOT EXISTS knowledge_search_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES project_knowledge_assets(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  chunk_text text NOT NULL CHECK (length(trim(chunk_text)) > 0),
  language text NOT NULL DEFAULT 'te-IN',
  embedding_model text NOT NULL DEFAULT 'text-embedding-004',
  embedding_vector real[],
  tsv_content tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, chunk_index)
);

-- 4. Cross-Entity Knowledge Asset References: Linking lore to scenes, characters, or blocks
CREATE TABLE IF NOT EXISTS knowledge_asset_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES project_knowledge_assets(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('scene', 'character', 'sequence', 'screenplay_block')),
  target_id uuid NOT NULL,
  relevance_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Telugu Dialect Terms: Regional glossaries and pronunciation nuances
CREATE TABLE IF NOT EXISTS telugu_dialect_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  standard_term text NOT NULL CHECK (length(trim(standard_term)) > 0),
  dialect_term text NOT NULL CHECK (length(trim(dialect_term)) > 0),
  dialect_region text NOT NULL CHECK (dialect_region IN (
    'telangana', 'rayalaseema', 'uttarandhra', 'coastal_andhra', 'hyderabad_slang', 'archaic_epic'
  )),
  meaning text NOT NULL,
  example_dialogue text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, dialect_term, dialect_region)
);

-- 6. Trigger for automated tsvector generation on knowledge search chunks
CREATE OR REPLACE FUNCTION update_knowledge_chunk_tsv() RETURNS trigger AS $$
BEGIN
  NEW.tsv_content := to_tsvector('simple', COALESCE(NEW.chunk_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_chunk_tsv
  BEFORE INSERT OR UPDATE OF chunk_text
  ON knowledge_search_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_chunk_tsv();

-- 7. Row Level Security Policies
ALTER TABLE project_knowledge_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_search_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_asset_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE telugu_dialect_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_assets_member_read ON project_knowledge_assets FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY knowledge_assets_member_write ON project_knowledge_assets FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY knowledge_chunks_member_read ON knowledge_search_chunks FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY knowledge_chunks_member_write ON knowledge_search_chunks FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY knowledge_refs_member_read ON knowledge_asset_references FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY knowledge_refs_member_write ON knowledge_asset_references FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY dialect_terms_member_read ON telugu_dialect_terms FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY dialect_terms_member_write ON telugu_dialect_terms FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 8. Indexes for hybrid retrieval and lookup performance
CREATE INDEX IF NOT EXISTS knowledge_assets_film_cat_idx ON project_knowledge_assets (film_id, category);
CREATE INDEX IF NOT EXISTS knowledge_chunks_film_asset_idx ON knowledge_search_chunks (film_id, asset_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_tsv_idx ON knowledge_search_chunks USING gin (tsv_content);
CREATE INDEX IF NOT EXISTS knowledge_refs_target_idx ON knowledge_asset_references (film_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS dialect_terms_film_region_idx ON telugu_dialect_terms (film_id, dialect_region);
