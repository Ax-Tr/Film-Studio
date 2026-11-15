-- Migration 0009_ai_provider_gateway.sql
-- Sprint 25: AI Provider Gateway and Secret Controls

-- 1. AI Provider Configurations with Envelope Encrypted API keys
CREATE TABLE IF NOT EXISTS ai_provider_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  film_id uuid REFERENCES films(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openai_compatible', 'local')),
  model_name text NOT NULL CHECK (length(trim(model_name)) BETWEEN 1 AND 120),
  encrypted_api_key bytea NOT NULL,
  key_encryption_iv bytea NOT NULL CHECK (octet_length(key_encryption_iv) = 12),
  key_encryption_tag bytea NOT NULL CHECK (octet_length(key_encryption_tag) = 16),
  kms_key_version text NOT NULL DEFAULT 'v1',
  endpoint_url text CHECK (endpoint_url IS NULL OR endpoint_url ~ '^https?://'),
  is_active boolean NOT NULL DEFAULT true,
  daily_spend_limit_cents integer NOT NULL DEFAULT 10000 CHECK (daily_spend_limit_cents >= 0),
  rate_limit_rpm integer NOT NULL DEFAULT 60 CHECK (rate_limit_rpm >= 1),
  timeout_ms integer NOT NULL DEFAULT 60000 CHECK (timeout_ms BETWEEN 1000 AND 300000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, model_name)
);

-- 2. AI Usage Ledger (Aggregates usage, costs, token counts without storing plain raw user screenplay text)
CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  film_id uuid REFERENCES films(id) ON DELETE SET NULL,
  config_id uuid NOT NULL REFERENCES ai_provider_configurations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  prompt_tokens integer NOT NULL CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL CHECK (completion_tokens >= 0),
  total_tokens integer NOT NULL CHECK (total_tokens >= 0),
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  operation_kind text NOT NULL CHECK (operation_kind IN ('analysis', 'proposal', 'character_arc', 'coverage', 'pitch', 'continuity_check')),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable Row-Level Security
ALTER TABLE ai_provider_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_ledger ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Organization members can read provider summaries if active in organization
CREATE POLICY ai_provider_config_member_read ON ai_provider_configurations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.organization_id = ai_provider_configurations.organization_id
      AND om.user_id = app_security.current_user_id()
  )
  OR EXISTS (
    SELECT 1 FROM film_memberships fm
    JOIN films f ON f.id = fm.film_id
    WHERE f.organization_id = ai_provider_configurations.organization_id
      AND fm.user_id = app_security.current_user_id()
      AND fm.status = 'active'
  )
);

CREATE POLICY ai_provider_config_admin_write ON ai_provider_configurations FOR ALL USING (
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.organization_id = ai_provider_configurations.organization_id
      AND om.user_id = app_security.current_user_id()
      AND om.role = 'owner'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.organization_id = ai_provider_configurations.organization_id
      AND om.user_id = app_security.current_user_id()
      AND om.role = 'owner'
  )
);

CREATE POLICY ai_usage_ledger_member_read ON ai_usage_ledger FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM film_memberships fm
    JOIN films f ON f.id = fm.film_id
    WHERE f.organization_id = ai_usage_ledger.organization_id
      AND fm.user_id = app_security.current_user_id()
      AND fm.status = 'active'
  )
);

CREATE POLICY ai_usage_ledger_member_insert ON ai_usage_ledger FOR INSERT WITH CHECK (
  actor_user_id = app_security.current_user_id()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS ai_config_org_active_idx ON ai_provider_configurations (organization_id, is_active);
CREATE INDEX IF NOT EXISTS ai_usage_org_created_idx ON ai_usage_ledger (organization_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_film_idx ON ai_usage_ledger (film_id, created_at);
