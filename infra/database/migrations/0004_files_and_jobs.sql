INSERT INTO permissions (key, description) VALUES
  ('film.files.read', 'Read and download film files and assets.'),
  ('film.files.upload', 'Upload files and attachments to a film.'),
  ('film.jobs.read', 'View background job status and history.'),
  ('film.jobs.create', 'Trigger background jobs such as exports or imports.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE film_quotas (
  film_id uuid PRIMARY KEY REFERENCES films(id) ON DELETE CASCADE,
  max_storage_bytes bigint NOT NULL DEFAULT 5368709120 CHECK (max_storage_bytes >= 0), -- 5 GB default
  used_storage_bytes bigint NOT NULL DEFAULT 0 CHECK (used_storage_bytes >= 0),
  max_concurrent_jobs integer NOT NULL DEFAULT 5 CHECK (max_concurrent_jobs > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  uploader_user_id uuid NOT NULL REFERENCES users(id),
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type ~ '^[a-z0-9.+_-]+/[a-z0-9.+_-]+$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  status text NOT NULL CHECK (status IN ('pending', 'uploaded', 'scanning', 'ready', 'quarantined', 'deleted')),
  quarantine_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (film_id, id)
);

CREATE TABLE background_jobs (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES users(id),
  queue_name text NOT NULL CHECK (queue_name IN ('exports', 'imports', 'notifications', 'ai-proposals')),
  job_type text NOT NULL CHECK (job_type ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  idempotency_key text,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dead_letter')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error_code text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, id),
  UNIQUE (film_id, idempotency_key)
);

CREATE INDEX files_film_status_idx ON files (film_id, status) WHERE deleted_at IS NULL;
CREATE INDEX background_jobs_queue_status_idx ON background_jobs (queue_name, status, next_run_at);
CREATE INDEX background_jobs_film_idx ON background_jobs (film_id, created_at DESC);

ALTER TABLE film_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY film_quotas_member_read ON film_quotas FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY film_quotas_member_write ON film_quotas FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY files_member_read ON files FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY files_uploader_insert ON files FOR INSERT WITH CHECK (
  app_security.has_active_film_membership(film_id)
  AND uploader_user_id = app_security.current_user_id()
);

CREATE POLICY files_editor_update ON files FOR UPDATE USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY background_jobs_member_read ON background_jobs FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY background_jobs_member_insert ON background_jobs FOR INSERT WITH CHECK (
  app_security.has_active_film_membership(film_id)
  AND creator_user_id = app_security.current_user_id()
);

CREATE POLICY background_jobs_worker_update ON background_jobs FOR UPDATE USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);
