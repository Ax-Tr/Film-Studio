-- Migration 0008_continuity_revisions.sql
-- Sprint 24: Continuity and Revision Control

-- 1. Continuity Facts: Canonical, scene-evidenced facts about characters, props, locations, time, or world rules
CREATE TABLE IF NOT EXISTS continuity_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('character', 'location', 'prop', 'time', 'world_rule')),
  entity_id uuid,
  attribute_key text NOT NULL CHECK (length(trim(attribute_key)) BETWEEN 1 AND 120),
  canonical_value text NOT NULL CHECK (length(trim(canonical_value)) >= 1),
  evidence_scene_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Continuity Issues: Potential vs confirmed issues, evidence links, and intentional exception overrides
CREATE TABLE IF NOT EXISTS continuity_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  fact_id uuid REFERENCES continuity_facts(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL,
  rule_code text NOT NULL CHECK (length(trim(rule_code)) BETWEEN 1 AND 100),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status text NOT NULL CHECK (status IN ('potential', 'confirmed', 'intentional_exception', 'resolved')),
  explanation text NOT NULL,
  resolution_notes text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Production Revisions: Industry standard colored revisions and draft locks
CREATE TABLE IF NOT EXISTS production_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number >= 1),
  color text NOT NULL CHECK (color IN (
    'white', 'blue', 'pink', 'yellow', 'green', 'goldenrod', 'buff', 'salmon', 'cherry', 'second_white', 'second_blue'
  )),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, document_id, revision_number)
);

-- 4. Revision Approvals: Formal signoff workflows with audit trail
CREATE TABLE IF NOT EXISTS revision_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES production_revisions(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  comments text,
  decision_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, revision_id, approver_id)
);

-- 5. Enable Row-Level Security
ALTER TABLE continuity_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE continuity_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_approvals ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY continuity_facts_member_read ON continuity_facts FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY continuity_facts_member_write ON continuity_facts FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY continuity_issues_member_read ON continuity_issues FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY continuity_issues_member_write ON continuity_issues FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY production_revisions_member_read ON production_revisions FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY production_revisions_member_write ON production_revisions FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY revision_approvals_member_read ON revision_approvals FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY revision_approvals_member_write ON revision_approvals FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS continuity_facts_film_entity_idx ON continuity_facts (film_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS continuity_issues_film_doc_scene_idx ON continuity_issues (film_id, document_id, scene_id);
CREATE INDEX IF NOT EXISTS continuity_issues_status_idx ON continuity_issues (film_id, status);
CREATE INDEX IF NOT EXISTS production_revisions_doc_idx ON production_revisions (film_id, document_id, revision_number);
CREATE INDEX IF NOT EXISTS revision_approvals_rev_idx ON revision_approvals (film_id, revision_id);
