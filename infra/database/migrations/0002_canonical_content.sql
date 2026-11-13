INSERT INTO permissions (key, description) VALUES
  ('film.documents.read', 'Read film documents and canonical screenplay structure.'),
  ('film.documents.edit', 'Create and modify film documents and screenplay structure.'),
  ('film.characters.read', 'Read film character records.'),
  ('film.characters.edit', 'Create and modify film character records.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE documents (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  language text NOT NULL CHECK (
    language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, id)
);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version bigint NOT NULL CHECK (document_version > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 bytea NOT NULL CHECK (octet_length(snapshot_sha256) = 32),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, document_id, id),
  UNIQUE (document_id, document_version),
  FOREIGN KEY (film_id, document_id)
    REFERENCES documents(film_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION app_security.reject_immutable_document_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'document versions are immutable';
END
$$;

CREATE TRIGGER document_versions_immutable
BEFORE UPDATE OR DELETE ON document_versions
FOR EACH ROW EXECUTE FUNCTION app_security.reject_immutable_document_version();

CREATE TABLE acts (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  position bigint NOT NULL CHECK (position >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, document_id, id),
  UNIQUE (document_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY (film_id, document_id)
    REFERENCES documents(film_id, id) ON DELETE CASCADE
);

CREATE TABLE sequences (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  act_id uuid,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  position bigint NOT NULL CHECK (position >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, document_id, id),
  UNIQUE (document_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY (film_id, document_id)
    REFERENCES documents(film_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, document_id, act_id)
    REFERENCES acts(film_id, document_id, id) ON DELETE RESTRICT
);

CREATE TABLE scenes (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  act_id uuid,
  sequence_id uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, document_id, id),
  FOREIGN KEY (film_id, document_id)
    REFERENCES documents(film_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, document_id, act_id)
    REFERENCES acts(film_id, document_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (film_id, document_id, sequence_id)
    REFERENCES sequences(film_id, document_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION app_security.validate_scene_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sequence_act_id uuid;
BEGIN
  IF NEW.sequence_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT sequence_record.act_id INTO sequence_act_id
  FROM sequences sequence_record
  WHERE sequence_record.film_id = NEW.film_id
    AND sequence_record.document_id = NEW.document_id
    AND sequence_record.id = NEW.sequence_id;
  IF NOT FOUND OR NEW.act_id IS DISTINCT FROM sequence_act_id THEN
    RAISE EXCEPTION 'scene hierarchy must match its sequence and act';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER scenes_validate_hierarchy
BEFORE INSERT OR UPDATE OF film_id, document_id, act_id, sequence_id ON scenes
FOR EACH ROW EXECUTE FUNCTION app_security.validate_scene_hierarchy();

CREATE TABLE document_scene_order (
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  position bigint NOT NULL CHECK (position >= 0),
  PRIMARY KEY (film_id, document_id, scene_id),
  UNIQUE (document_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY (film_id, document_id, scene_id)
    REFERENCES scenes(film_id, document_id, id) ON DELETE CASCADE
);

CREATE TABLE screenplay_block_projections (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL,
  document_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  source_document_version_id uuid NOT NULL,
  position bigint NOT NULL CHECK (position >= 0),
  block_type text NOT NULL CHECK (block_type IN (
    'scene-heading', 'action', 'character', 'dialogue', 'parenthetical',
    'transition', 'shot', 'note'
  )),
  text_content text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(attributes) = 'object'),
  projected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, document_id, scene_id, id),
  UNIQUE (scene_id, position),
  FOREIGN KEY (film_id, document_id, scene_id)
    REFERENCES scenes(film_id, document_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, document_id, source_document_version_id)
    REFERENCES document_versions(film_id, document_id, id) ON DELETE RESTRICT
);

CREATE TABLE characters (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 240),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, id)
);

CREATE TABLE model_mutations (
  operation_id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  operation_key text NOT NULL CHECK (operation_key ~ '^[a-z][a-z0-9_.-]+$'),
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, operation_id)
);

CREATE INDEX documents_film_updated_idx
  ON documents (film_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX scenes_document_idx ON scenes (film_id, document_id);
CREATE INDEX document_scene_order_position_idx
  ON document_scene_order (film_id, document_id, position);
CREATE INDEX characters_film_name_idx
  ON characters (film_id, display_name) WHERE deleted_at IS NULL;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_scene_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenplay_block_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_mutations ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_member_read ON documents FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY documents_editor_write ON documents FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY document_versions_member_read ON document_versions FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY document_versions_editor_insert ON document_versions FOR INSERT WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY acts_member_read ON acts FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY acts_editor_write ON acts FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY sequences_member_read ON sequences FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY sequences_editor_write ON sequences FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY scenes_member_read ON scenes FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY scenes_editor_write ON scenes FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY scene_order_member_read ON document_scene_order FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY scene_order_editor_write ON document_scene_order FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY block_projections_member_read ON screenplay_block_projections FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY block_projections_editor_write ON screenplay_block_projections FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY characters_member_read ON characters FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY characters_editor_write ON characters FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.characters.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.characters.edit')
);

CREATE POLICY model_mutations_actor_read ON model_mutations FOR SELECT USING (
  actor_user_id = app_security.current_user_id()
);
CREATE POLICY model_mutations_actor_insert ON model_mutations FOR INSERT WITH CHECK (
  actor_user_id = app_security.current_user_id()
  AND app_security.has_active_film_membership(film_id)
);
