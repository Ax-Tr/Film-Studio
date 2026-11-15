-- Migration 0010_ai_proposal_workflow.sql
-- Sprint 26: AI Proposal Workflow

-- 1. AI Content Manifests: Exact content/version snapshot presented to user before AI invocation
CREATE TABLE IF NOT EXISTS ai_content_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES ai_provider_configurations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  document_version bigint NOT NULL CHECK (document_version >= 1),
  selected_scene_ids uuid[] NOT NULL DEFAULT '{}',
  selected_character_ids uuid[] NOT NULL DEFAULT '{}',
  context_summary_hash text NOT NULL CHECK (length(context_summary_hash) = 64),
  operation_kind text NOT NULL CHECK (operation_kind IN (
    'rewrite', 'dialogue_polish', 'scene_expansion', 'character_voice',
    'continuity_check', 'coverage_analysis', 'translation', 'pitch_draft'
  )),
  language text NOT NULL DEFAULT 'te-IN',
  consent_granted boolean NOT NULL DEFAULT false,
  consent_granted_at timestamptz,
  status text NOT NULL CHECK (status IN ('draft', 'consent_pending', 'consented', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. AI Proposals: Generated outputs linked to a manifest, presented for accept/reject/edit
CREATE TABLE IF NOT EXISTS ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  manifest_id uuid NOT NULL REFERENCES ai_content_manifests(id) ON DELETE CASCADE,
  proposal_index integer NOT NULL DEFAULT 1 CHECK (proposal_index >= 1),
  content_type text NOT NULL CHECK (content_type IN ('scene_block', 'dialogue', 'action_line', 'character_note', 'report', 'pitch_section')),
  original_text text NOT NULL,
  proposed_text text NOT NULL,
  target_scene_id uuid,
  target_character_id uuid,
  rationale text,
  confidence_score real CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected', 'edited')),
  edited_text text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manifest_id, proposal_index)
);

-- 3. Enable Row-Level Security
ALTER TABLE ai_content_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY ai_manifests_member_read ON ai_content_manifests FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY ai_manifests_member_write ON ai_content_manifests FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY ai_proposals_member_read ON ai_proposals FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY ai_proposals_member_write ON ai_proposals FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS ai_manifests_film_doc_idx ON ai_content_manifests (film_id, document_id, status);
CREATE INDEX IF NOT EXISTS ai_proposals_manifest_idx ON ai_proposals (manifest_id, proposal_index);
CREATE INDEX IF NOT EXISTS ai_proposals_decision_idx ON ai_proposals (film_id, decision);
