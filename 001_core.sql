-- STORYFORGE STUDIO / PostgreSQL foundation migration proposal
-- Status: architectural DDL, NOT executed against PostgreSQL in this environment.
-- Requires PostgreSQL 15+ (target version must be selected/pinned at implementation).
-- Review security policies, tenancy tests, data retention and migrator locks before deployment.
-- This core migration intentionally precedes additive migrations for the full 19-module roadmap.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT 'te-IN',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (email = lower(email))
);

CREATE TABLE user_auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issuer text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('web','android','ios','desktop_optional')),
  friendly_name text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, device_id) REFERENCES devices(user_id, id) ON DELETE RESTRICT
);

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE organisation_members (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','member','billing')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organisation_id uuid REFERENCES organisations(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  default_language text NOT NULL DEFAULT 'te',
  genre text,
  logline text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','completed')),
  server_revision bigint NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','screenwriter','co_writer','dialogue_writer','director','producer','editor','production_manager','reviewer')),
  can_export boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'concept','one_line','logline','short_synopsis','detailed_synopsis','treatment',
    'scene_outline','beat_sheet','sequence_breakdown','screenplay','dialogue_draft',
    'revised_screenplay','shooting_script','production_draft')),
  language text NOT NULL DEFAULT 'te',
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  document_id uuid NOT NULL,
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  label text NOT NULL,
  snapshot_sha256 text NOT NULL,
  snapshot_object_key text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, revision_number),
  FOREIGN KEY (project_id, document_id) REFERENCES documents(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  position_key text NOT NULL,
  description text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  UNIQUE (project_id, id),
  UNIQUE (project_id, position_key)
);

CREATE TABLE sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  act_id uuid,
  title text NOT NULL,
  position_key text NOT NULL,
  description text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  UNIQUE (project_id, id),
  UNIQUE (project_id, position_key),
  FOREIGN KEY (project_id, act_id) REFERENCES acts(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  document_id uuid NOT NULL,
  act_id uuid,
  sequence_id uuid,
  location_id uuid,
  position_key text NOT NULL,
  display_number text,
  int_ext text CHECK (int_ext IN ('INT','EXT','INT_EXT','OTHER')),
  time_of_day text,
  scene_purpose text,
  emotional_tone text,
  estimated_duration_seconds integer CHECK (estimated_duration_seconds >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','locked')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (project_id, id),
  UNIQUE (document_id, position_key),
  FOREIGN KEY (project_id, document_id) REFERENCES documents(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, act_id) REFERENCES acts(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, sequence_id) REFERENCES sequences(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, location_id) REFERENCES locations(project_id, id) ON DELETE RESTRICT
);

-- The scene's Yjs event history is authoritative for collaborative text.
-- Scene blocks are a queryable, versioned projection, rebuilt transactionally.
CREATE TABLE scene_blocks (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  position_key text NOT NULL,
  block_type text NOT NULL CHECK (block_type IN (
    'scene_heading','action','character_intro','character_cue','dialogue','parenthetical',
    'voice_over','off_screen','transition','montage','flashback','dream_sequence',
    'intercut','shot','super','sound_cue','camera_direction','scene_continuation')),
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  plain_text text NOT NULL DEFAULT '',
  projection_revision bigint NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  UNIQUE (project_id, id),
  UNIQUE (scene_id, position_key),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  language_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE character_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  character_id uuid NOT NULL,
  alias text NOT NULL,
  UNIQUE (project_id, character_id, alias),
  FOREIGN KEY (project_id, character_id) REFERENCES characters(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE character_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  from_character_id uuid NOT NULL,
  to_character_id uuid NOT NULL,
  relation_type text NOT NULL,
  description text,
  CHECK (from_character_id <> to_character_id),
  FOREIGN KEY (project_id, from_character_id) REFERENCES characters(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, to_character_id) REFERENCES characters(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE character_appearances (
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  character_id uuid NOT NULL,
  has_dialogue boolean NOT NULL DEFAULT false,
  projection_revision bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (scene_id, character_id),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, character_id) REFERENCES characters(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE story_beats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  scene_id uuid,
  title text NOT NULL,
  beat_type text,
  position_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE continuity_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  source_scene_id uuid,
  related_scene_id uuid,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('confirmed','potential','review_required')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','intentional_exception','resolved')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, source_scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, related_scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE file_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_count bigint NOT NULL CHECK (byte_count >= 0),
  checksum_sha256 text NOT NULL,
  purpose text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE sync_operations (
  op_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_sequence bigint NOT NULL CHECK (client_sequence > 0),
  server_revision bigint NOT NULL CHECK (server_revision > 0),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  kind text NOT NULL,
  base_version bigint,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  crdt_update bytea,
  created_at_client timestamptz,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, client_sequence),
  UNIQUE (project_id, server_revision)
);

CREATE TABLE sync_device_cursors (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  acked_server_revision bigint NOT NULL DEFAULT 0 CHECK (acked_server_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, device_id)
);

CREATE TABLE sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_op_id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reason text NOT NULL,
  base_payload jsonb,
  local_payload jsonb NOT NULL,
  remote_payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
  resolution_op_id uuid REFERENCES sync_operations(op_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE scene_crdt_updates (
  op_id uuid PRIMARY KEY REFERENCES sync_operations(op_id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  update_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE scene_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  upto_server_revision bigint NOT NULL CHECK (upto_server_revision >= 0),
  yjs_state bytea NOT NULL,
  state_vector bytea NOT NULL,
  schema_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, upto_server_revision),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  scene_id uuid,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  anchor jsonb NOT NULL DEFAULT '{}'::jsonb,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  scene_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  anchor jsonb NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE ai_provider_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  model text NOT NULL,
  endpoint_url text,
  encrypted_api_key bytea,
  encryption_key_ref text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

CREATE TABLE ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  config_id uuid,
  task_type text NOT NULL,
  selected_scope jsonb NOT NULL,
  consent_record jsonb NOT NULL,
  request_status text NOT NULL DEFAULT 'queued' CHECK (request_status IN ('queued','running','completed','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, config_id) REFERENCES ai_provider_configurations(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  ai_request_id uuid NOT NULL,
  suggestion_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposal_status text NOT NULL DEFAULT 'proposed' CHECK (proposal_status IN ('proposed','accepted','rejected','edited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, ai_request_id) REFERENCES ai_requests(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE ai_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  ai_request_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_tokens bigint CHECK (prompt_tokens >= 0),
  completion_tokens bigint CHECK (completion_tokens >= 0),
  estimated_cost_minor bigint CHECK (estimated_cost_minor >= 0),
  currency_code char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, ai_request_id) REFERENCES ai_requests(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  format text NOT NULL CHECK (format IN ('pdf','docx','txt','fountain','fdx','csv','xlsx')),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, document_id) REFERENCES documents(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE export_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  export_job_id uuid NOT NULL,
  file_asset_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, export_job_id) REFERENCES export_jobs(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, file_asset_id) REFERENCES file_assets(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE props (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE costumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  UNIQUE (project_id, id)
);

CREATE TABLE scene_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  element_type text NOT NULL,
  element_id uuid,
  manual_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (element_id IS NOT NULL OR manual_label IS NOT NULL),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
  -- Polymorphic element_id validated in application; migrate to typed link tables for strict FK.
);

CREATE TABLE production_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 1,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE shooting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

CREATE TABLE shooting_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  shoot_date date,
  order_index integer NOT NULL CHECK (order_index >= 0),
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (project_id, schedule_id) REFERENCES shooting_schedules(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT,
  UNIQUE (schedule_id, order_index)
);

CREATE TABLE budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  scene_id uuid,
  category text NOT NULL,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  rate_minor bigint NOT NULL DEFAULT 0 CHECK (rate_minor >= 0),
  low_estimate_minor bigint CHECK (low_estimate_minor >= 0),
  high_estimate_minor bigint CHECK (high_estimate_minor >= 0),
  currency_code char(3) NOT NULL DEFAULT 'INR',
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id) ON DELETE RESTRICT,
  CHECK (low_estimate_minor IS NULL OR high_estimate_minor IS NULL OR high_estimate_minor >= low_estimate_minor)
);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  encrypted boolean NOT NULL DEFAULT true,
  checksum_sha256 text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Future enterprise/billing compatibility without prematurely selecting a billing vendor.
CREATE TABLE subscription_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  entitlement_key text NOT NULL,
  limit_value bigint,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  CHECK ((organisation_id IS NOT NULL) <> (user_id IS NOT NULL)),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- Common indexes. Include tenant/project as leading key for project-scoped access.
CREATE INDEX idx_projects_owner ON projects(owner_user_id, updated_at DESC);
CREATE INDEX idx_projects_org ON projects(organisation_id, updated_at DESC);
CREATE INDEX idx_project_members_user ON project_members(user_id, project_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_documents_project ON documents(project_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_scenes_document_order ON scenes(project_id, document_id, position_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_blocks_scene_order ON scene_blocks(project_id, scene_id, position_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_blocks_plain_text ON scene_blocks USING gin (to_tsvector('simple', plain_text));
CREATE INDEX idx_characters_project ON characters(project_id, display_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_char_appearances_project ON character_appearances(project_id, character_id);
CREATE INDEX idx_sync_pull ON sync_operations(project_id, server_revision);
CREATE INDEX idx_sync_device ON sync_operations(device_id, client_sequence);
CREATE INDEX idx_conflict_review ON sync_conflicts(project_id, status, created_at DESC);
CREATE INDEX idx_crdt_scene ON scene_crdt_updates(project_id, scene_id, created_at);
CREATE INDEX idx_scene_snapshots ON scene_snapshots(project_id, scene_id, upto_server_revision DESC);
CREATE INDEX idx_continuity_project ON continuity_issues(project_id, status);
CREATE INDEX idx_ai_requests_project ON ai_requests(project_id, created_at DESC);
CREATE INDEX idx_exports_project ON export_jobs(project_id, created_at DESC);
CREATE INDEX idx_audit_project ON audit_logs(project_id, occurred_at DESC);

COMMIT;

-- Required implementation follow-ups BEFORE production:
-- 1. Strong transaction-pinning for revision allocation and all projection writes.
-- 2. PostgreSQL RLS and/or scoped repository policy on ALL project-owned tables,
--    plus negative tenant isolation integration tests. No RLS is enabled by this draft.
-- 3. Triggers or DB-enforced invariants for document-scoped scene -> act/sequence,
--    membership of device to actor, and linked production element types.
-- 4. Delete/retention and PITR restoration runbooks.
-- 5. Additive migrations for narrative threads, continuity facts, detailed enterprise
--    invitations, approval workflows, import jobs and full knowledge/film modules.
-- 6. Test this SQL against a real PostgreSQL instance; static review is NOT enough.
