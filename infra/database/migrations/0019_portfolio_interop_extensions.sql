-- 0019_portfolio_interop_extensions.sql
-- Sprint 35: Portfolio, Interoperability, and Extension Boundaries (Gate G9)

CREATE TABLE IF NOT EXISTS organization_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portfolio_film_assignments (
  portfolio_id UUID NOT NULL REFERENCES organization_portfolios(id) ON DELETE CASCADE,
  film_id UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portfolio_id, film_id)
);

CREATE TABLE IF NOT EXISTS file_interop_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('import', 'export', 'migration')),
  format TEXT NOT NULL CHECK (format IN ('pdf', 'docx', 'txt', 'fountain', 'fdx', 'csv', 'xlsx')),
  source_file_storage_key TEXT,
  result_file_storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  input_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  conformance_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  retained_source_on_failure BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  extension_identifier TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sandbox_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_endpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, extension_identifier, version)
);

CREATE TABLE IF NOT EXISTS extension_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES extension_manifests(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_resource TEXT NOT NULL,
  sandbox_boundary_enforced BOOLEAN NOT NULL DEFAULT true,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-performance portfolio aggregations and interop auditing
CREATE INDEX IF NOT EXISTS idx_portfolios_org ON organization_portfolios (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_films_film ON portfolio_film_assignments (film_id);
CREATE INDEX IF NOT EXISTS idx_interop_jobs_film ON file_interop_jobs (film_id, job_type, status);
CREATE INDEX IF NOT EXISTS idx_extension_manifests_org ON extension_manifests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_extension_audit_ext ON extension_audit_logs (extension_id, created_at);

-- Enable RLS
ALTER TABLE organization_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_film_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_interop_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_audit_logs ENABLE ROW LEVEL SECURITY;
