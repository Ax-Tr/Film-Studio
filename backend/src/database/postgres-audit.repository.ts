import type { Pool } from 'pg';
import type { AuditEventEnvelope } from '@film-studio/contracts';
import type { AuditRepository } from '../modules/audit/audit.service.js';

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async insert(
    event: AuditEventEnvelope,
    sourceIpHash?: Uint8Array,
    userAgentHash?: Uint8Array,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.film_id', $2, true)`,
        [event.actorUserId ?? '', event.filmId ?? ''],
      );
      await client.query(
        `INSERT INTO audit_events (
          id, occurred_at, actor_user_id, actor_session_id,
          film_id, organization_id, action, outcome, target_type,
          target_id, request_id, source_ip_hash, user_agent_hash, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )`,
        [
          event.id,
          event.occurredAt,
          event.actorUserId ?? null,
          event.actorSessionId ?? null,
          event.filmId ?? null,
          event.organizationId ?? null,
          event.action,
          event.outcome,
          event.targetType ?? null,
          event.targetId ?? null,
          event.requestId,
          sourceIpHash ?? null,
          userAgentHash ?? null,
          event.metadata,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
