import type { Pool, PoolClient } from 'pg';
import type {
  CollaborationThreadDto,
  CollaborationCommentDto,
  CollaborationAnnotationDto,
  CollaborationPresenceSessionDto,
  CollaborationNotificationDto,
  CreateCollaborationThreadInput,
  CreateCollaborationCommentInput,
  CreateCollaborationAnnotationInput,
  UpdateCollaborationPresenceInput,
  CollaborationThreadWithCommentsDto,
  CollaborationTargetType,
  CollaborationThreadStatus,
  CollaborationNotificationEventType,
} from '@film-studio/contracts';

interface ThreadRow {
  id: string;
  film_id: string;
  target_type: CollaborationTargetType;
  target_id: string;
  anchor_range: Record<string, unknown> | null;
  title: string | null;
  status: CollaborationThreadStatus;
  created_by_user_id: string;
  resolved_by_user_id: string | null;
  resolved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CommentRow {
  id: string;
  film_id: string;
  thread_id: string;
  author_user_id: string;
  parent_comment_id: string | null;
  content: string;
  content_format: 'plain' | 'markdown' | 'rich_text';
  is_edited: boolean;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AnnotationRow {
  id: string;
  film_id: string;
  thread_id: string | null;
  target_type: 'document' | 'scene' | 'screenplay_block';
  target_id: string;
  color_category: 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange';
  start_offset: number;
  end_offset: number;
  highlighted_text: string;
  note: string | null;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PresenceRow {
  id: string;
  film_id: string;
  user_id: string;
  device_id: string;
  client_type: 'web' | 'android' | 'ios' | 'desktop';
  active_document_id: string | null;
  active_scene_id: string | null;
  cursor_position: Record<string, unknown> | null;
  state: 'active' | 'idle' | 'offline';
  last_heartbeat: Date | string;
  created_at: Date | string;
}

interface NotificationRow {
  id: string;
  film_id: string;
  recipient_user_id: string;
  sender_user_id: string | null;
  event_type: CollaborationNotificationEventType;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at: Date | string | null;
  created_at: Date | string;
}

function toIso(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
}

function mapThread(row: ThreadRow): CollaborationThreadDto {
  return {
    id: row.id,
    filmId: row.film_id,
    targetType: row.target_type,
    targetId: row.target_id,
    anchorRange: row.anchor_range ?? null,
    title: row.title ?? null,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    resolvedByUserId: row.resolved_by_user_id ?? null,
    resolvedAt: toIso(row.resolved_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapComment(row: CommentRow): CollaborationCommentDto {
  return {
    id: row.id,
    filmId: row.film_id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    parentCommentId: row.parent_comment_id ?? null,
    content: row.content,
    contentFormat: row.content_format,
    isEdited: Boolean(row.is_edited),
    deletedAt: toIso(row.deleted_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapAnnotation(row: AnnotationRow): CollaborationAnnotationDto {
  return {
    id: row.id,
    filmId: row.film_id,
    threadId: row.thread_id ?? null,
    targetType: row.target_type,
    targetId: row.target_id,
    colorCategory: row.color_category,
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    highlightedText: row.highlighted_text,
    note: row.note ?? null,
    createdByUserId: row.created_by_user_id,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapPresence(row: PresenceRow): CollaborationPresenceSessionDto {
  return {
    id: row.id,
    filmId: row.film_id,
    userId: row.user_id,
    deviceId: row.device_id,
    clientType: row.client_type,
    activeDocumentId: row.active_document_id ?? null,
    activeSceneId: row.active_scene_id ?? null,
    cursorPosition: row.cursor_position ?? null,
    state: row.state,
    lastHeartbeat: toIso(row.last_heartbeat) ?? new Date().toISOString(),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapNotification(row: NotificationRow): CollaborationNotificationDto {
  return {
    id: row.id,
    filmId: row.film_id,
    recipientUserId: row.recipient_user_id,
    senderUserId: row.sender_user_id ?? null,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ?? {},
    isRead: Boolean(row.is_read),
    readAt: toIso(row.read_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export class PostgresCollaborationRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a thread and initial comment atomically
  async createThread(
    input: CreateCollaborationThreadInput,
    createdByUserId: string,
    client?: PoolClient,
  ): Promise<CollaborationThreadWithCommentsDto> {
    const threadRes = await this.getExecutor(client).query<ThreadRow>(
      `INSERT INTO collaboration_threads (
         film_id, target_type, target_id, anchor_range, title, status, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, 'open', $6)
       RETURNING *`,
      [
        input.filmId,
        input.targetType,
        input.targetId,
        input.anchorRange ? JSON.stringify(input.anchorRange) : null,
        input.title ?? null,
        createdByUserId,
      ],
    );
    const thread = threadRes.rows[0];
    if (!thread) {
      throw new Error('Failed to create collaboration thread');
    }

    const commentRes = await this.getExecutor(client).query<CommentRow>(
      `INSERT INTO collaboration_comments (
         film_id, thread_id, author_user_id, content, content_format
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.filmId,
        thread.id,
        createdByUserId,
        input.initialComment,
        input.contentFormat ?? 'plain',
      ],
    );
    const comment = commentRes.rows[0];
    if (!comment) {
      throw new Error('Failed to create initial collaboration comment');
    }

    return {
      thread: mapThread(thread),
      comments: [mapComment(comment)],
    };
  }

  // 2. Get a thread and all comments
  async getThread(
    threadId: string,
    client?: PoolClient,
  ): Promise<CollaborationThreadWithCommentsDto | null> {
    const threadRes = await this.getExecutor(client).query<ThreadRow>(
      `SELECT t.*
       FROM collaboration_threads t
       WHERE t.id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = t.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [threadId],
    );
    const thread = threadRes.rows[0];
    if (!thread) return null;

    const commentsRes = await this.getExecutor(client).query<CommentRow>(
      `SELECT c.*
       FROM collaboration_comments c
       WHERE c.thread_id = $1
       ORDER BY c.created_at ASC`,
      [threadId],
    );

    return {
      thread: mapThread(thread),
      comments: commentsRes.rows.map(mapComment),
    };
  }

  // 3. List threads with filters and membership protection
  async listThreads(
    filmId: string,
    filter?: {
      targetType?: CollaborationTargetType;
      targetId?: string;
      status?: CollaborationThreadStatus;
    },
    client?: PoolClient,
  ): Promise<CollaborationThreadDto[]> {
    const conditions: string[] = [
      't.film_id = $1',
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = t.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [filmId];

    if (filter?.targetType) {
      params.push(filter.targetType);
      conditions.push(`t.target_type = $${params.length}`);
    }
    if (filter?.targetId) {
      params.push(filter.targetId);
      conditions.push(`t.target_id = $${params.length}`);
    }
    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`t.status = $${params.length}`);
    }

    const res = await this.getExecutor(client).query<ThreadRow>(
      `SELECT t.*
       FROM collaboration_threads t
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC`,
      params,
    );
    return res.rows.map(mapThread);
  }

  // 4. Resolve or archive a thread
  async resolveThread(
    threadId: string,
    resolvedByUserId: string,
    status: 'resolved' | 'archived' = 'resolved',
    client?: PoolClient,
  ): Promise<CollaborationThreadDto | null> {
    const res = await this.getExecutor(client).query<ThreadRow>(
      `UPDATE collaboration_threads
       SET status = $2,
           resolved_by_user_id = $3,
           resolved_at = now(),
           updated_at = now()
       WHERE id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = collaboration_threads.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       RETURNING *`,
      [threadId, status, resolvedByUserId],
    );
    const row = res.rows[0];
    return row ? mapThread(row) : null;
  }

  // 5. Reopen a thread
  async reopenThread(
    threadId: string,
    client?: PoolClient,
  ): Promise<CollaborationThreadDto | null> {
    const res = await this.getExecutor(client).query<ThreadRow>(
      `UPDATE collaboration_threads
       SET status = 'open',
           resolved_by_user_id = NULL,
           resolved_at = NULL,
           updated_at = now()
       WHERE id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = collaboration_threads.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       RETURNING *`,
      [threadId],
    );
    const row = res.rows[0];
    return row ? mapThread(row) : null;
  }

  // 6. Add comment to an existing thread
  async addComment(
    input: CreateCollaborationCommentInput,
    authorUserId: string,
    client?: PoolClient,
  ): Promise<CollaborationCommentDto> {
    const res = await this.getExecutor(client).query<CommentRow>(
      `INSERT INTO collaboration_comments (
         film_id, thread_id, author_user_id, parent_comment_id, content, content_format
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.filmId,
        input.threadId,
        authorUserId,
        input.parentCommentId ?? null,
        input.content,
        input.contentFormat ?? 'plain',
      ],
    );
    const comment = res.rows[0];
    if (!comment) {
      throw new Error('Failed to create collaboration comment');
    }

    // Touch thread updated_at
    await this.getExecutor(client).query(
      `UPDATE collaboration_threads SET updated_at = now() WHERE id = $1`,
      [input.threadId],
    );

    return mapComment(comment);
  }

  // 7. List comments for a thread
  async listComments(
    threadId: string,
    client?: PoolClient,
  ): Promise<CollaborationCommentDto[]> {
    const res = await this.getExecutor(client).query<CommentRow>(
      `SELECT c.*
       FROM collaboration_comments c
       WHERE c.thread_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = c.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY c.created_at ASC`,
      [threadId],
    );
    return res.rows.map(mapComment);
  }

  // 8. Create an annotation (highlight range)
  async createAnnotation(
    input: CreateCollaborationAnnotationInput,
    createdByUserId: string,
    client?: PoolClient,
  ): Promise<CollaborationAnnotationDto> {
    const res = await this.getExecutor(client).query<AnnotationRow>(
      `INSERT INTO collaboration_annotations (
         film_id, thread_id, target_type, target_id, color_category,
         start_offset, end_offset, highlighted_text, note, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.filmId,
        input.threadId ?? null,
        input.targetType,
        input.targetId,
        input.colorCategory ?? 'yellow',
        input.startOffset,
        input.endOffset,
        input.highlightedText,
        input.note ?? null,
        createdByUserId,
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to create collaboration annotation');
    }
    return mapAnnotation(row);
  }

  // 9. List annotations for target
  async listAnnotations(
    filmId: string,
    targetType?: 'document' | 'scene' | 'screenplay_block',
    targetId?: string,
    client?: PoolClient,
  ): Promise<CollaborationAnnotationDto[]> {
    const conditions: string[] = [
      'a.film_id = $1',
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = a.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [filmId];

    if (targetType) {
      params.push(targetType);
      conditions.push(`a.target_type = $${params.length}`);
    }
    if (targetId) {
      params.push(targetId);
      conditions.push(`a.target_id = $${params.length}`);
    }

    const res = await this.getExecutor(client).query<AnnotationRow>(
      `SELECT a.*
       FROM collaboration_annotations a
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.start_offset ASC, a.created_at ASC`,
      params,
    );
    return res.rows.map(mapAnnotation);
  }

  // 10. Delete an annotation
  async deleteAnnotation(
    annotationId: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const res = await this.getExecutor(client).query(
      `DELETE FROM collaboration_annotations
       WHERE id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = collaboration_annotations.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [annotationId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // 11. Upsert presence heartbeat
  async updatePresence(
    input: UpdateCollaborationPresenceInput,
    userId: string,
    client?: PoolClient,
  ): Promise<CollaborationPresenceSessionDto> {
    const res = await this.getExecutor(client).query<PresenceRow>(
      `INSERT INTO collaboration_presence_sessions (
         film_id, user_id, device_id, client_type, active_document_id,
         active_scene_id, cursor_position, state, last_heartbeat
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (film_id, user_id, device_id) DO UPDATE SET
         client_type = EXCLUDED.client_type,
         active_document_id = EXCLUDED.active_document_id,
         active_scene_id = EXCLUDED.active_scene_id,
         cursor_position = EXCLUDED.cursor_position,
         state = EXCLUDED.state,
         last_heartbeat = now()
       RETURNING *`,
      [
        input.filmId,
        userId,
        input.deviceId,
        input.clientType,
        input.activeDocumentId ?? null,
        input.activeSceneId ?? null,
        input.cursorPosition ? JSON.stringify(input.cursorPosition) : null,
        input.state,
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to update presence session');
    }
    return mapPresence(row);
  }

  // 12. List active presence sessions
  async listActivePresence(
    filmId: string,
    activeDocumentId?: string,
    idleThresholdSeconds = 60,
    client?: PoolClient,
  ): Promise<CollaborationPresenceSessionDto[]> {
    const conditions: string[] = [
      'p.film_id = $1',
      `p.last_heartbeat >= now() - ($2 || ' seconds')::interval`,
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = p.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [filmId, idleThresholdSeconds];

    if (activeDocumentId) {
      params.push(activeDocumentId);
      conditions.push(`p.active_document_id = $${params.length}`);
    }

    const res = await this.getExecutor(client).query<PresenceRow>(
      `SELECT p.*
       FROM collaboration_presence_sessions p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.last_heartbeat DESC`,
      params,
    );
    return res.rows.map(mapPresence);
  }

  // 13. Create a notification
  async createNotification(
    data: {
      filmId: string;
      recipientUserId: string;
      senderUserId?: string;
      eventType: CollaborationNotificationEventType;
      entityType: string;
      entityId: string;
      payload?: Record<string, unknown>;
    },
    client?: PoolClient,
  ): Promise<CollaborationNotificationDto> {
    const res = await this.getExecutor(client).query<NotificationRow>(
      `INSERT INTO collaboration_notifications (
         film_id, recipient_user_id, sender_user_id, event_type, entity_type, entity_id, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.filmId,
        data.recipientUserId,
        data.senderUserId ?? null,
        data.eventType,
        data.entityType,
        data.entityId,
        data.payload ? JSON.stringify(data.payload) : '{}',
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to create notification');
    }
    return mapNotification(row);
  }

  // 14. List notifications for current user
  async listNotifications(
    recipientUserId: string,
    filmId?: string,
    unreadOnly = false,
    client?: PoolClient,
  ): Promise<CollaborationNotificationDto[]> {
    const conditions: string[] = [
      'n.recipient_user_id = $1',
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = n.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [recipientUserId];

    if (filmId) {
      params.push(filmId);
      conditions.push(`n.film_id = $${params.length}`);
    }
    if (unreadOnly) {
      conditions.push(`n.is_read = false`);
    }

    const res = await this.getExecutor(client).query<NotificationRow>(
      `SELECT n.*
       FROM collaboration_notifications n
       WHERE ${conditions.join(' AND ')}
       ORDER BY n.created_at DESC`,
      params,
    );
    return res.rows.map(mapNotification);
  }

  // 15. Mark notification as read
  async markNotificationRead(
    notificationId: string,
    recipientUserId: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const res = await this.getExecutor(client).query(
      `UPDATE collaboration_notifications
       SET is_read = true,
           read_at = now()
       WHERE id = $1
         AND recipient_user_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = collaboration_notifications.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [notificationId, recipientUserId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
