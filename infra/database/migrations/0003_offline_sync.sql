ALTER TABLE films
  ADD COLUMN IF NOT EXISTS compaction_floor bigint NOT NULL DEFAULT 0 CHECK (compaction_floor >= 0);

INSERT INTO permissions (key, description) VALUES
  ('film.sync.pull', 'Pull sync log and snapshots for a film.'),
  ('film.sync.push', 'Push offline operations and updates for a film.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE sync_device_sequences (
  device_id uuid NOT NULL,
  client_sequence bigint NOT NULL CHECK (client_sequence >= 0),
  operation_id uuid NOT NULL,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, client_sequence),
  UNIQUE (film_id, operation_id)
);

CREATE TABLE operation_ledger (
  operation_id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid NOT NULL,
  client_sequence bigint NOT NULL CHECK (client_sequence >= 0),
  server_revision bigint NOT NULL CHECK (server_revision > 0),
  entity_type text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  entity_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  base_version bigint CHECK (base_version IS NULL OR base_version >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at_client timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, server_revision),
  UNIQUE (film_id, operation_id),
  FOREIGN KEY (device_id, client_sequence)
    REFERENCES sync_device_sequences(device_id, client_sequence) ON DELETE RESTRICT
);

CREATE TABLE sync_device_acks (
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  acknowledged_revision bigint NOT NULL CHECK (acknowledged_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, device_id)
);

CREATE TABLE sync_conflicts (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid NOT NULL,
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'SAME_FIELD_CHANGED', 'DELETE_VS_EDIT', 'FUTURE_BASE_VERSION', 'CONCURRENT_CONFLICT'
  )),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  base_version bigint,
  server_version bigint NOT NULL,
  client_payload jsonb NOT NULL CHECK (jsonb_typeof(client_payload) = 'object'),
  server_payload jsonb NOT NULL CHECK (jsonb_typeof(server_payload) = 'object'),
  recovery_branch_id uuid,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_strategy text CHECK (
    resolution_strategy IS NULL OR
    resolution_strategy IN ('keep_local', 'keep_remote', 'merge', 'save_alternative')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, id),
  UNIQUE (film_id, operation_id)
);

CREATE TABLE scene_crdt_updates (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  server_revision bigint NOT NULL CHECK (server_revision > 0),
  update_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, scene_id, operation_id),
  UNIQUE (film_id, server_revision),
  FOREIGN KEY (film_id, server_revision)
    REFERENCES operation_ledger(film_id, server_revision) ON DELETE CASCADE
);

CREATE TABLE scene_crdt_snapshots (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL,
  upto_server_revision bigint NOT NULL CHECK (upto_server_revision >= 0),
  state_vector bytea NOT NULL,
  snapshot_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, scene_id, upto_server_revision)
);

CREATE INDEX operation_ledger_film_revision_idx
  ON operation_ledger (film_id, server_revision ASC);

CREATE INDEX operation_ledger_entity_idx
  ON operation_ledger (film_id, entity_type, entity_id);

CREATE INDEX sync_conflicts_film_resolved_idx
  ON sync_conflicts (film_id, resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX sync_device_acks_film_idx
  ON sync_device_acks (film_id, updated_at DESC);

CREATE OR REPLACE FUNCTION app_security.allocate_film_revision(target_film_id uuid)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  next_revision bigint;
BEGIN
  UPDATE films
  SET server_revision = server_revision + 1,
      updated_at = now()
  WHERE id = target_film_id
  RETURNING server_revision INTO next_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'film % not found', target_film_id;
  END IF;

  RETURN next_revision;
END;
$$;

ALTER TABLE sync_device_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_device_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_crdt_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_crdt_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_sequences_member_read ON sync_device_sequences FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY sync_sequences_member_insert ON sync_device_sequences FOR INSERT WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY operation_ledger_member_read ON operation_ledger FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY operation_ledger_editor_insert ON operation_ledger FOR INSERT WITH CHECK (
  app_security.has_active_film_membership(film_id)
  AND actor_user_id = app_security.current_user_id()
);

CREATE POLICY sync_acks_member_read ON sync_device_acks FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY sync_acks_member_write ON sync_device_acks FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY sync_conflicts_member_read ON sync_conflicts FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY sync_conflicts_member_write ON sync_conflicts FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY crdt_updates_member_read ON scene_crdt_updates FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY crdt_updates_editor_insert ON scene_crdt_updates FOR INSERT WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY crdt_snapshots_member_read ON scene_crdt_snapshots FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY crdt_snapshots_editor_insert ON scene_crdt_snapshots FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

