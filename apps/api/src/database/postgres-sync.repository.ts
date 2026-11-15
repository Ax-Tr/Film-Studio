import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  encodeSyncCursor,
  type AcceptedOperation,
  type ClientOperation,
  type ConflictRecord,
  type ConflictType,
  type SyncPullResponse,
  type SyncPushResult,
} from '@film-studio/sync-core';
import type { SyncRepository } from '../modules/sync/sync.repository.js';

interface LedgerRow {
  operation_id: string;
  film_id: string;
  actor_user_id: string;
  device_id: string;
  client_sequence: string;
  server_revision: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  base_version: string | null;
  payload: Record<string, unknown>;
  created_at_client: Date | string;
  recorded_at: Date | string;
}

interface ConflictRow {
  id: string;
  film_id: string;
  operation_id: string;
  actor_user_id: string;
  device_id: string;
  conflict_type: string;
  entity_type: string;
  entity_id: string;
  base_version: string | null;
  server_version: string;
  client_payload: Record<string, unknown>;
  server_payload: Record<string, unknown>;
  recovery_branch_id: string | null;
  resolved_at: Date | string | null;
  resolved_by: string | null;
  resolution_strategy: string | null;
  created_at: Date | string;
}

export class PostgresSyncRepository implements SyncRepository {
  constructor(private readonly pool: Pool) {}

  async pushOperations(
    userId: string,
    filmId: string,
    operations: readonly ClientOperation[],
  ): Promise<{ results: SyncPushResult[]; latestServerRevision: number }> {
    return this.transaction(userId, filmId, async (client) => {
      const results: SyncPushResult[] = [];

      for (const op of operations) {
        // 1. Check device sequence reuse
        const existingSeq = await client.query<{ operation_id: string }>(
          `SELECT operation_id FROM sync_device_sequences
           WHERE device_id = $1 AND client_sequence = $2`,
          [op.deviceId, op.clientSequence],
        );

        if (existingSeq.rows.length > 0) {
          const priorOpId = existingSeq.rows[0]?.operation_id;
          if (priorOpId !== op.opId) {
            results.push({
              opId: op.opId,
              status: 'rejected',
              errorCode: 'DEVICE_SEQUENCE_REUSE',
            });
            continue;
          }

          // Same opId already associated: check if already in ledger or conflicts
          const existingLedger = await client.query<{
            server_revision: string;
            base_version: string | null;
          }>(
            `SELECT server_revision, base_version FROM operation_ledger
             WHERE film_id = $1 AND operation_id = $2`,
            [filmId, op.opId],
          );
          if (existingLedger.rows.length > 0) {
            results.push({
              opId: op.opId,
              status: 'already_applied',
              serverRevision: Number(existingLedger.rows[0]?.server_revision),
            });
            continue;
          }

          const existingConflict = await client.query<{ id: string; conflict_type: string }>(
            `SELECT id, conflict_type FROM sync_conflicts
             WHERE film_id = $1 AND operation_id = $2`,
            [filmId, op.opId],
          );
          const conflictRow = existingConflict.rows[0];
          if (conflictRow !== undefined) {
            results.push({
              opId: op.opId,
              status: 'conflict',
              conflictId: conflictRow.id,
              errorCode: conflictRow.conflict_type,
            });
            continue;
          }
        } else {
          // Record device sequence
          await client.query(
            `INSERT INTO sync_device_sequences (device_id, client_sequence, operation_id, film_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (device_id, client_sequence) DO NOTHING`,
            [op.deviceId, op.clientSequence, op.opId, filmId],
          );
        }

        // 2. Validate entity
        let entityVersion = 1;
        let isDeleted = false;
        let currentPayload: Record<string, unknown> = {};

        if (op.entityType === 'document') {
          const docRes = await client.query<{
            version: string;
            deleted_at: Date | null;
            title: string;
            kind: string;
            language: string;
          }>(
            `SELECT version, deleted_at, title, kind, language FROM documents
             WHERE film_id = $1 AND id = $2`,
            [filmId, op.entityId],
          );
          if (docRes.rows.length === 0) {
            results.push({
              opId: op.opId,
              status: 'rejected',
              errorCode: 'ENTITY_NOT_FOUND',
            });
            continue;
          }
          const row = docRes.rows[0]!;
          entityVersion = Number(row.version);
          isDeleted = row.deleted_at !== null;
          currentPayload = { title: row.title, kind: row.kind, language: row.language };
        } else if (op.entityType === 'scene') {
          const sceneRes = await client.query<{
            version: string;
            deleted_at: Date | null;
          }>(
            `SELECT version, deleted_at FROM scenes
             WHERE film_id = $1 AND id = $2`,
            [filmId, op.entityId],
          );
          if (sceneRes.rows.length === 0) {
            results.push({
              opId: op.opId,
              status: 'rejected',
              errorCode: 'ENTITY_NOT_FOUND',
            });
            continue;
          }
          const row = sceneRes.rows[0]!;
          entityVersion = Number(row.version);
          isDeleted = row.deleted_at !== null;
          currentPayload = {};
        }

        // 3. Check future base version
        if (op.baseVersion !== null && op.baseVersion > entityVersion) {
          results.push({
            opId: op.opId,
            status: 'rejected',
            errorCode: 'FUTURE_BASE_VERSION',
          });
          continue;
        }

        // 4. Check delete vs edit
        if (isDeleted && op.kind !== 'entity.delete' && op.kind !== 'scene.restore') {
          const conflictId = randomUUID();
          await client.query(
            `INSERT INTO sync_conflicts (
               id, film_id, operation_id, actor_user_id, device_id,
               conflict_type, entity_type, entity_id, base_version,
               server_version, client_payload, server_payload
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              conflictId,
              filmId,
              op.opId,
              userId,
              op.deviceId,
              'DELETE_VS_EDIT',
              op.entityType,
              op.entityId,
              op.baseVersion,
              entityVersion,
              op.payload,
              { status: 'deleted' },
            ],
          );
          results.push({
            opId: op.opId,
            status: 'conflict',
            conflictId,
            errorCode: 'DELETE_VS_EDIT',
          });
          continue;
        }

        // 5. Check stale base version and conflicting fields
        if (op.baseVersion !== null && op.baseVersion < entityVersion) {
          // Check prior accepted operations on this entity
          const priorOps = await client.query<{ payload: Record<string, unknown> }>(
            `SELECT payload FROM operation_ledger
             WHERE film_id = $1 AND entity_id = $2`,
            [filmId, op.entityId],
          );

          let hasSameFieldChange = false;
          for (const prior of priorOps.rows) {
            for (const key of Object.keys(op.payload)) {
              if (
                key in prior.payload &&
                JSON.stringify(currentPayload[key]) !== JSON.stringify(op.payload[key])
              ) {
                hasSameFieldChange = true;
                break;
              }
            }
            if (hasSameFieldChange) break;
          }

          if (hasSameFieldChange) {
            const conflictId = randomUUID();
            await client.query(
              `INSERT INTO sync_conflicts (
                 id, film_id, operation_id, actor_user_id, device_id,
                 conflict_type, entity_type, entity_id, base_version,
                 server_version, client_payload, server_payload
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                conflictId,
                filmId,
                op.opId,
                userId,
                op.deviceId,
                'SAME_FIELD_CHANGED',
                op.entityType,
                op.entityId,
                op.baseVersion,
                entityVersion,
                op.payload,
                currentPayload,
              ],
            );
            results.push({
              opId: op.opId,
              status: 'conflict',
              conflictId,
              errorCode: 'SAME_FIELD_CHANGED',
            });
            continue;
          }
        }

        // 6. Valid operation: allocate monotonic server revision
        const revResult = await client.query<{ allocate_film_revision: string }>(
          `SELECT app_security.allocate_film_revision($1)`,
          [filmId],
        );
        const serverRevision = Number(revResult.rows[0]?.allocate_film_revision);

        // Update entity in database
        if (op.entityType === 'document') {
          const updates: string[] = ['version = version + 1', 'updated_at = now()'];
          const values: unknown[] = [filmId, op.entityId];
          let paramIdx = 3;

          if (typeof op.payload['title'] === 'string') {
            updates.push(`title = $${paramIdx++}`);
            values.push(op.payload['title']);
          }
          if (typeof op.payload['kind'] === 'string') {
            updates.push(`kind = $${paramIdx++}`);
            values.push(op.payload['kind']);
          }
          if (typeof op.payload['language'] === 'string') {
            updates.push(`language = $${paramIdx}`);
            values.push(op.payload['language']);
          }

          await client.query(
            `UPDATE documents SET ${updates.join(', ')} WHERE film_id = $1 AND id = $2`,
            values,
          );
        } else if (op.entityType === 'scene') {
          await client.query(
            `UPDATE scenes SET version = version + 1, updated_at = now() WHERE film_id = $1 AND id = $2`,
            [filmId, op.entityId],
          );
        }

        // Record in operation ledger
        await client.query(
          `INSERT INTO operation_ledger (
             operation_id, film_id, actor_user_id, device_id, client_sequence,
             server_revision, entity_type, entity_id, kind, base_version,
             payload, created_at_client
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            op.opId,
            filmId,
            userId,
            op.deviceId,
            op.clientSequence,
            serverRevision,
            op.entityType,
            op.entityId,
            op.kind,
            op.baseVersion,
            op.payload,
            op.createdAtClient,
          ],
        );

        // If CRDT binary update present
        if (op.kind === 'scene.crdt.update' && typeof op.payload['updateBase64'] === 'string') {
          const updateBytes = Buffer.from(op.payload['updateBase64'], 'base64');
          await client.query(
            `INSERT INTO scene_crdt_updates (
               id, film_id, scene_id, operation_id, server_revision, update_bytes
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [randomUUID(), filmId, op.entityId, op.opId, serverRevision, updateBytes],
          );
        }

        results.push({
          opId: op.opId,
          status: 'applied',
          serverRevision,
          entityVersion: entityVersion + 1,
        });
      }

      const filmRes = await client.query<{ server_revision: string }>(
        `SELECT server_revision FROM films WHERE id = $1`,
        [filmId],
      );
      const latestServerRevision = Number(filmRes.rows[0]?.server_revision ?? 0);

      return { results, latestServerRevision };
    });
  }

  async pullOperations(
    userId: string,
    filmId: string,
    cursorRevision: number,
    limit: number,
  ): Promise<SyncPullResponse> {
    return this.transaction(userId, filmId, async (client) => {
      const filmRes = await client.query<{
        server_revision: string;
        compaction_floor: string;
      }>(
        `SELECT server_revision, compaction_floor FROM films WHERE id = $1`,
        [filmId],
      );
      if (filmRes.rows.length === 0) {
        throw new Error(`Film ${filmId} not found`);
      }
      const latestServerRevision = Number(filmRes.rows[0]?.server_revision ?? 0);
      const compactionFloor = Number(filmRes.rows[0]?.compaction_floor ?? 0);

      if (cursorRevision < compactionFloor) {
        return {
          kind: 'snapshot_required',
          operations: [],
          nextCursor: encodeSyncCursor({
            filmId,
            revision: latestServerRevision,
            issuedAt: new Date().toISOString(),
          }),
          hasMore: false,
          latestServerRevision,
          floorRevision: compactionFloor,
        };
      }

      const safeLimit = Math.min(Math.max(1, limit), 500);
      const rows = await client.query<LedgerRow>(
        `SELECT * FROM operation_ledger
         WHERE film_id = $1 AND server_revision > $2
         ORDER BY server_revision ASC
         LIMIT $3`,
        [filmId, cursorRevision, safeLimit + 1],
      );

      const hasMore = rows.rows.length > safeLimit;
      const returnedRows = hasMore ? rows.rows.slice(0, safeLimit) : rows.rows;
      const operations: AcceptedOperation[] = returnedRows.map((row) => ({
        schemaVersion: 1,
        opId: row.operation_id,
        filmId: row.film_id,
        actorUserId: row.actor_user_id,
        deviceId: row.device_id,
        clientSequence: Number(row.client_sequence),
        serverRevision: Number(row.server_revision),
        entityType: row.entity_type,
        entityId: row.entity_id,
        kind: row.kind,
        baseVersion: row.base_version === null ? null : Number(row.base_version),
        payload: row.payload,
        createdAtClient: new Date(row.created_at_client).toISOString(),
        recordedAt: new Date(row.recorded_at).toISOString(),
      }));

      const lastRev = operations.length > 0 ? operations[operations.length - 1]!.serverRevision : cursorRevision;
      const nextCursor = encodeSyncCursor({
        filmId,
        revision: lastRev,
        issuedAt: new Date().toISOString(),
      });

      return {
        kind: 'operations',
        operations,
        nextCursor,
        hasMore,
        latestServerRevision,
      };
    });
  }

  async acknowledgeRevision(
    userId: string,
    filmId: string,
    deviceId: string,
    serverRevision: number,
  ): Promise<void> {
    await this.transaction(userId, filmId, async (client) => {
      await client.query(
        `INSERT INTO sync_device_acks (film_id, device_id, acknowledged_revision, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (film_id, device_id)
         DO UPDATE SET
           acknowledged_revision = GREATEST(sync_device_acks.acknowledged_revision, EXCLUDED.acknowledged_revision),
           updated_at = now()`,
        [filmId, deviceId, serverRevision],
      );
    });
  }

  async listConflicts(userId: string, filmId: string): Promise<ConflictRecord[]> {
    return this.transaction(userId, filmId, async (client) => {
      const result = await client.query<ConflictRow>(
        `SELECT * FROM sync_conflicts
         WHERE film_id = $1 AND resolved_at IS NULL
         ORDER BY created_at DESC`,
        [filmId],
      );
      return result.rows.map((row) => this.mapConflict(row));
    });
  }

  async resolveConflict(
    userId: string,
    filmId: string,
    conflictId: string,
    resolution: {
      choice: 'keep_local' | 'keep_remote' | 'merge' | 'save_alternative';
      mergedPayload?: Record<string, unknown>;
    },
  ): Promise<ConflictRecord> {
    return this.transaction(userId, filmId, async (client) => {
      const result = await client.query<ConflictRow>(
        `UPDATE sync_conflicts
         SET resolved_at = now(),
             resolved_by = $1,
             resolution_strategy = $2
         WHERE film_id = $3 AND id = $4
         RETURNING *`,
        [userId, resolution.choice, filmId, conflictId],
      );
      if (result.rows.length === 0) {
        throw new Error(`Conflict ${conflictId} not found`);
      }
      return this.mapConflict(result.rows[0]!);
    });
  }

  async setCompactionFloor(
    userId: string,
    filmId: string,
    floorRevision: number,
  ): Promise<number> {
    return this.transaction(userId, filmId, async (client) => {
      const acks = await client.query<{ acknowledged_revision: string }>(
        `SELECT acknowledged_revision FROM sync_device_acks WHERE film_id = $1`,
        [filmId],
      );
      const film = await client.query<{ server_revision: string }>(
        `SELECT server_revision FROM films WHERE id = $1`,
        [filmId],
      );
      const serverRev = Number(film.rows[0]?.server_revision ?? 0);
      const activeAcks = acks.rows.map((r) => Number(r.acknowledged_revision));
      const minAck = activeAcks.length === 0 ? serverRev : Math.min(...activeAcks);

      if (floorRevision > minAck) {
        throw new Error('Compaction would strand an active device');
      }

      await client.query(
        `UPDATE films SET compaction_floor = $1 WHERE id = $2`,
        [floorRevision, filmId],
      );
      return floorRevision;
    });
  }

  private mapConflict(row: ConflictRow): ConflictRecord {
    return {
      id: row.id,
      filmId: row.film_id,
      operationId: row.operation_id,
      actorUserId: row.actor_user_id,
      deviceId: row.device_id,
      conflictType: row.conflict_type as ConflictType,
      entityType: row.entity_type,
      entityId: row.entity_id,
      baseVersion: row.base_version === null ? null : Number(row.base_version),
      serverVersion: Number(row.server_version),
      clientPayload: row.client_payload,
      serverPayload: row.server_payload,
      createdAt: new Date(row.created_at).toISOString(),
      ...(row.recovery_branch_id !== null && row.recovery_branch_id !== undefined
        ? { recoveryBranchId: row.recovery_branch_id }
        : {}),
      ...(row.resolved_at !== null && row.resolved_at !== undefined
        ? { resolvedAt: new Date(row.resolved_at).toISOString() }
        : {}),
      ...(row.resolved_by !== null && row.resolved_by !== undefined
        ? { resolvedBy: row.resolved_by }
        : {}),
      ...(row.resolution_strategy !== null && row.resolution_strategy !== undefined
        ? {
            resolutionStrategy: row.resolution_strategy as
              | 'keep_local'
              | 'keep_remote'
              | 'merge'
              | 'save_alternative',
          }
        : {}),
    };
  }

  private async transaction<T>(
    userId: string,
    filmId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.film_id', $2, true)`,
        [userId, filmId],
      );
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
