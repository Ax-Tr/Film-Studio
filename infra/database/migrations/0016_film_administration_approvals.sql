-- Migration 0016_film_administration_approvals.sql
-- Sprint 32: Film Administration and Approvals (Gate G8: Collaboration and Enterprise)

-- 1. Film Administration & Approvals Permissions
INSERT INTO permissions (key, description) VALUES
  ('film.admin.manage_roles', 'Create, modify, and assign custom roles and permission overrides for a film.'),
  ('film.admin.transfer_ownership', 'Initiate, accept, or cancel film ownership transfers.'),
  ('film.admin.approval_manage', 'Create and configure film approval policies and initiate approval requests.'),
  ('film.admin.approval_vote', 'Review and record binding approval or rejection decisions.'),
  ('film.admin.break_glass', 'Super Admin operational controls and audited break-glass access.'),
  ('film.admin.export_delete', 'Request owner exports, retention management, and permanent deletion.')
ON CONFLICT (key) DO NOTHING;

-- 2. Film Approval Policies: Configurable multi-tier approval chains
CREATE TABLE IF NOT EXISTS film_approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  policy_type text NOT NULL CHECK (policy_type IN (
    'screenplay_draft', 'shooting_schedule', 'production_budget', 'casting_lock', 'final_cut', 'general_decision'
  )),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
  description text,
  required_role_keys text[] NOT NULL DEFAULT '{}',
  min_approvals integer NOT NULL DEFAULT 1 CHECK (min_approvals >= 1),
  is_sequential boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, policy_type)
);

-- 3. Film Approval Requests: Concrete approval instances with audit tracking
CREATE TABLE IF NOT EXISTS film_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES film_approval_policies(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('document', 'schedule', 'budget', 'character', 'cut', 'other')),
  target_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  summary text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid NOT NULL REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Film Approval Decisions: Recorded voter decisions with digital signatures/notes
CREATE TABLE IF NOT EXISTS film_approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES film_approval_requests(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'abstained')),
  feedback text,
  signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, approver_user_id)
);

-- 5. Film Ownership Transfers: Cryptographic tokenized transfer lifecycle
CREATE TABLE IF NOT EXISTS film_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  current_owner_user_id uuid NOT NULL REFERENCES users(id),
  target_owner_user_id uuid NOT NULL REFERENCES users(id),
  initiated_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'accepted', 'rejected', 'cancelled', 'expired')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Super Admin Break-Glass Operational Access Sessions
CREATE TABLE IF NOT EXISTS admin_break_glass_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES users(id),
  target_film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  ticket_reference text NOT NULL CHECK (length(trim(ticket_reference)) >= 3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'revoked')),
  ip_hash bytea CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Film Lifecycle and Retention Requests (Owner Export / Archive / Delete)
CREATE TABLE IF NOT EXISTS film_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  retention_period_days integer NOT NULL DEFAULT 365 CHECK (retention_period_days > 0),
  auto_purge_deleted_items boolean NOT NULL DEFAULT true,
  purge_delay_days integer NOT NULL DEFAULT 30 CHECK (purge_delay_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id)
);

CREATE TABLE IF NOT EXISTS film_lifecycle_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN ('export_archive', 'permanent_delete', 'soft_archive')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'completed', 'failed', 'cancelled')),
  export_manifest jsonb CHECK (export_manifest IS NULL OR jsonb_typeof(export_manifest) = 'object'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Row Level Security Policies
ALTER TABLE film_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_ownership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_break_glass_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_lifecycle_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_policies_member_read ON film_approval_policies FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY approval_policies_admin_write ON film_approval_policies FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY approval_requests_member_read ON film_approval_requests FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY approval_requests_member_write ON film_approval_requests FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY approval_decisions_member_read ON film_approval_decisions FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY approval_decisions_member_write ON film_approval_decisions FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY ownership_transfers_member_read ON film_ownership_transfers FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY ownership_transfers_admin_write ON film_ownership_transfers FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY break_glass_admin_read ON admin_break_glass_sessions FOR SELECT USING (
  admin_user_id = current_setting('app.user_id', true)::uuid
);
CREATE POLICY break_glass_admin_write ON admin_break_glass_sessions FOR ALL USING (
  admin_user_id = current_setting('app.user_id', true)::uuid
) WITH CHECK (
  admin_user_id = current_setting('app.user_id', true)::uuid
);

CREATE POLICY retention_policies_member_read ON film_retention_policies FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY retention_policies_admin_write ON film_retention_policies FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY lifecycle_requests_member_read ON film_lifecycle_requests FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY lifecycle_requests_member_write ON film_lifecycle_requests FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS approval_policies_film_type_idx ON film_approval_policies (film_id, policy_type);
CREATE INDEX IF NOT EXISTS approval_requests_film_target_idx ON film_approval_requests (film_id, target_type, target_id, status);
CREATE INDEX IF NOT EXISTS approval_decisions_req_idx ON film_approval_decisions (request_id, approver_user_id);
CREATE INDEX IF NOT EXISTS ownership_transfers_film_idx ON film_ownership_transfers (film_id, status);
CREATE INDEX IF NOT EXISTS break_glass_film_idx ON admin_break_glass_sessions (target_film_id, status, expires_at);
CREATE INDEX IF NOT EXISTS lifecycle_requests_film_idx ON film_lifecycle_requests (film_id, status);
