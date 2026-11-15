-- Migration 0017_quotas_and_enterprise_readiness.sql
-- Sprint 33: Quotas and Enterprise Readiness (Gate G8 Exit)

-- 1. Enterprise permissions
INSERT INTO permissions (key, description) VALUES
  ('org.quotas.read', 'Read organization quota limits, usage records, and feature policies.'),
  ('org.quotas.manage', 'Modify organization quota thresholds, resource ceilings, and tiers.'),
  ('org.features.manage', 'Enable or disable enterprise feature policies for an organization.'),
  ('org.legal.manage', 'Record and review enterprise data processing and privacy consents.')
ON CONFLICT (key) DO NOTHING;

-- 2. Organization Quotas: Server-enforced limits and usage accounting
CREATE TABLE IF NOT EXISTS organization_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'pro', 'enterprise', 'custom')),
  max_storage_bytes bigint NOT NULL DEFAULT 5368709120 CHECK (max_storage_bytes >= 0),
  used_storage_bytes bigint NOT NULL DEFAULT 0 CHECK (used_storage_bytes >= 0),
  max_films integer NOT NULL DEFAULT 10 CHECK (max_films >= 1),
  max_members_per_film integer NOT NULL DEFAULT 50 CHECK (max_members_per_film >= 1),
  max_monthly_ai_tokens bigint NOT NULL DEFAULT 1000000 CHECK (max_monthly_ai_tokens >= 0),
  used_monthly_ai_tokens bigint NOT NULL DEFAULT 0 CHECK (used_monthly_ai_tokens >= 0),
  max_concurrent_editors integer NOT NULL DEFAULT 10 CHECK (max_concurrent_editors >= 1),
  data_residency_region text NOT NULL DEFAULT 'in-south-1' CHECK (data_residency_region IN (
    'in-south-1', 'in-west-1', 'ap-south-1', 'us-east-1', 'eu-west-1'
  )),
  enforce_strict_quotas boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

-- 3. Enterprise Feature Policies: Flagging and governance for enterprise capabilities
CREATE TABLE IF NOT EXISTS enterprise_feature_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9_.-]+$'),
  is_enabled boolean NOT NULL DEFAULT true,
  policy_rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(policy_rules) = 'object'),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, feature_key)
);

-- 4. Quota Usage Records: Ledger for consumption changes
CREATE TABLE IF NOT EXISTS quota_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  film_id uuid REFERENCES films(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN (
    'storage_bytes', 'ai_tokens', 'export_count', 'member_count', 'concurrent_session'
  )),
  delta bigint NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  reference_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Enterprise Legal Consents: Tamper-evident DPA, IP waiver, and AI opt-out tracking
CREATE TABLE IF NOT EXISTS enterprise_legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  film_id uuid REFERENCES films(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN (
    'data_processing_agreement', 'privacy_policy', 'ai_training_opt_out', 'intellectual_property_waiver', 'nda_acknowledgement'
  )),
  version text NOT NULL CHECK (length(trim(version)) BETWEEN 1 AND 50),
  consented_by_user_id uuid NOT NULL REFERENCES users(id),
  consented_at timestamptz NOT NULL DEFAULT now(),
  ip_hash bytea CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

-- 6. Row Level Security Policies
ALTER TABLE organization_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_feature_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_legal_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_quotas_member_read ON organization_quotas FOR SELECT USING (
  app_security.has_active_organization_membership(organization_id)
);
CREATE POLICY org_quotas_admin_write ON organization_quotas FOR ALL USING (
  app_security.has_active_organization_membership(organization_id, ARRAY['owner', 'admin'])
) WITH CHECK (
  app_security.has_active_organization_membership(organization_id, ARRAY['owner', 'admin'])
);

CREATE POLICY feature_policies_member_read ON enterprise_feature_policies FOR SELECT USING (
  app_security.has_active_organization_membership(organization_id)
);
CREATE POLICY feature_policies_admin_write ON enterprise_feature_policies FOR ALL USING (
  app_security.has_active_organization_membership(organization_id, ARRAY['owner', 'admin'])
) WITH CHECK (
  app_security.has_active_organization_membership(organization_id, ARRAY['owner', 'admin'])
);

CREATE POLICY quota_records_member_read ON quota_usage_records FOR SELECT USING (
  app_security.has_active_organization_membership(organization_id)
);
CREATE POLICY quota_records_member_write ON quota_usage_records FOR ALL USING (
  app_security.has_active_organization_membership(organization_id)
) WITH CHECK (
  app_security.has_active_organization_membership(organization_id)
);

CREATE POLICY legal_consents_member_read ON enterprise_legal_consents FOR SELECT USING (
  app_security.has_active_organization_membership(organization_id)
);
CREATE POLICY legal_consents_admin_write ON enterprise_legal_consents FOR ALL USING (
  app_security.has_active_organization_membership(organization_id, ARRAY['owner', 'admin'])
) WITH CHECK (
  app_security.has_active_organization_membership(organization_id, ARRAY['owner', 'admin'])
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS org_quotas_tier_idx ON organization_quotas (tier);
CREATE INDEX IF NOT EXISTS feat_policies_org_key_idx ON enterprise_feature_policies (organization_id, feature_key);
CREATE INDEX IF NOT EXISTS quota_records_org_time_idx ON quota_usage_records (organization_id, resource_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS legal_consents_org_type_idx ON enterprise_legal_consents (organization_id, consent_type);
