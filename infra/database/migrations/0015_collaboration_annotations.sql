-- Migration 0015_collaboration_annotations.sql
-- Sprint 31: Multi-User Collaboration (Gate G8: Collaboration and Enterprise)

-- 1. Collaboration permissions
INSERT INTO permissions (key, description) VALUES
  ('film.collaboration.read', 'Read collaboration threads, comments, annotations, presence, and notifications.'),
  ('film.collaboration.edit', 'Create and modify collaboration threads, comments, annotations, and presence heartbeats.'),
  ('film.collaboration.resolve', 'Resolve, reopen, or archive collaboration threads.')
ON CONFLICT (key) DO NOTHING;

-- 2. Collaboration Threads: Anchored discussions across screenplay, scenes, blocks, or breakdown elements
CREATE TABLE IF NOT EXISTS collaboration_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN (
    'document', 'scene', 'screenplay_block', 'character', 'sequence', 'breakdown_item', 'schedule_strip', 'budget_line_item'
  )),
  target_id uuid NOT NULL,
  anchor_range jsonb CHECK (anchor_range IS NULL OR jsonb_typeof(anchor_range) = 'object'),
  title text CHECK (title IS NULL OR length(trim(title)) BETWEEN 1 AND 255),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  resolved_by_user_id uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Collaboration Comments: Threaded replies with Telugu/multilingual Unicode text support
CREATE TABLE IF NOT EXISTS collaboration_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES collaboration_threads(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id),
  parent_comment_id uuid REFERENCES collaboration_comments(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) > 0),
  content_format text NOT NULL DEFAULT 'plain' CHECK (content_format IN ('plain', 'markdown', 'rich_text')),
  is_edited boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Collaboration Annotations: Highlight ranges, color categories, anchor survival metadata
CREATE TABLE IF NOT EXISTS collaboration_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES collaboration_threads(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('document', 'scene', 'screenplay_block')),
  target_id uuid NOT NULL,
  color_category text NOT NULL DEFAULT 'yellow' CHECK (color_category IN ('yellow', 'blue', 'green', 'pink', 'purple', 'orange')),
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset >= start_offset),
  highlighted_text text NOT NULL,
  note text,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Collaboration Presence Sessions: Non-authoritative active editors & cursor heartbeats
CREATE TABLE IF NOT EXISTS collaboration_presence_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  client_type text NOT NULL DEFAULT 'web' CHECK (client_type IN ('web', 'android', 'ios', 'desktop')),
  active_document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  active_scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  cursor_position jsonb CHECK (cursor_position IS NULL OR jsonb_typeof(cursor_position) = 'object'),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'idle', 'offline')),
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, user_id, device_id)
);

-- 6. Collaboration Notifications: Real-time & queued events (mentions, comments, revokes, conflicts)
CREATE TABLE IF NOT EXISTS collaboration_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'thread_created', 'comment_added', 'mention', 'thread_resolved', 'access_granted', 'access_revoked', 'revision_published', 'conflict_detected'
  )),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) BETWEEN 1 AND 64),
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Row Level Security Policies
ALTER TABLE collaboration_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_presence_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY collab_threads_member_read ON collaboration_threads FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY collab_threads_member_write ON collaboration_threads FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY collab_comments_member_read ON collaboration_comments FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY collab_comments_member_write ON collaboration_comments FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY collab_annotations_member_read ON collaboration_annotations FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY collab_annotations_member_write ON collaboration_annotations FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY collab_presence_member_read ON collaboration_presence_sessions FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY collab_presence_member_write ON collaboration_presence_sessions FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY collab_notifications_recipient_read ON collaboration_notifications FOR SELECT USING (
  recipient_user_id = current_setting('app.user_id', true)::uuid
  AND app_security.has_active_film_membership(film_id)
);
CREATE POLICY collab_notifications_member_write ON collaboration_notifications FOR ALL USING (
  app_security.has_active_film_membership(film_id)
) WITH CHECK (
  app_security.has_active_film_membership(film_id)
);

-- 8. Indexes for high-performance concurrent collaboration queries
CREATE INDEX IF NOT EXISTS collab_threads_film_target_idx ON collaboration_threads (film_id, target_type, target_id, status);
CREATE INDEX IF NOT EXISTS collab_comments_thread_idx ON collaboration_comments (thread_id, created_at);
CREATE INDEX IF NOT EXISTS collab_annotations_target_idx ON collaboration_annotations (film_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS collab_presence_film_doc_idx ON collaboration_presence_sessions (film_id, active_document_id, last_heartbeat);
CREATE INDEX IF NOT EXISTS collab_notifications_recipient_idx ON collaboration_notifications (recipient_user_id, is_read, created_at DESC);
