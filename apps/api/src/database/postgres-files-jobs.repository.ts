import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface FileRecord {
  readonly id: string;
  readonly filmId: string;
  readonly uploaderUserId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256Hex: string;
  readonly status:
    | 'pending'
    | 'uploaded'
    | 'scanning'
    | 'ready'
    | 'quarantined'
    | 'deleted';
  readonly quarantineReason?: string;
  readonly createdAt: string;
}

export interface BackgroundJobRecord {
  readonly id: string;
  readonly filmId: string;
  readonly creatorUserId: string;
  readonly queueName: 'exports' | 'imports' | 'notifications' | 'ai-proposals';
  readonly jobType: string;
  readonly idempotencyKey?: string;
  readonly status: 'queued' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  readonly payload: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly nextRunAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface FileRow {
  id: string;
  film_id: string;
  uploader_user_id: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: string;
  sha256: Buffer;
  status: string;
  quarantine_reason: string | null;
  created_at: Date | string;
}

interface JobRow {
  id: string;
  film_id: string;
  creator_user_id: string;
  queue_name: string;
  job_type: string;
  idempotency_key: string | null;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  next_run_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresFilesJobsRepository {
  constructor(private readonly pool: Pool) {}

  async createFile(
    userId: string,
    filmId: string,
    input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256Hex: string;
    },
  ): Promise<FileRecord> {
    return this.transaction(userId, filmId, async (client) => {
      // 1. Check & reserve storage quota
      const quotaRes = await client.query<{
        max_storage_bytes: string;
        used_storage_bytes: string;
      }>(
        `SELECT max_storage_bytes, used_storage_bytes FROM film_quotas
         WHERE film_id = $1 FOR UPDATE`,
        [filmId],
      );

      const maxBytes = BigInt(quotaRes.rows[0]?.max_storage_bytes ?? '5368709120');
      const usedBytes = BigInt(quotaRes.rows[0]?.used_storage_bytes ?? '0');
      const addBytes = BigInt(input.sizeBytes);

      if (usedBytes + addBytes > maxBytes) {
        const error = new Error('Film storage quota exceeded') as Error & {
          code: string;
        };
        error.code = 'STORAGE_QUOTA_EXCEEDED';
        throw error;
      }

      // Upsert quota
      await client.query(
        `INSERT INTO film_quotas (film_id, max_storage_bytes, used_storage_bytes, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (film_id)
         DO UPDATE SET used_storage_bytes = film_quotas.used_storage_bytes + $4, updated_at = now()`,
        [filmId, maxBytes.toString(), addBytes.toString(), addBytes.toString()],
      );

      const fileId = randomUUID();
      const storageKey = `films/${filmId}/assets/${fileId}-${encodeURIComponent(input.fileName)}`;
      const sha256Buffer = Buffer.from(input.sha256Hex, 'hex');

      const res = await client.query<FileRow>(
        `INSERT INTO files (
           id, film_id, uploader_user_id, storage_key, file_name,
           mime_type, size_bytes, sha256, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         RETURNING *`,
        [
          fileId,
          filmId,
          userId,
          storageKey,
          input.fileName,
          input.mimeType,
          input.sizeBytes,
          sha256Buffer,
        ],
      );

      return this.mapFile(res.rows[0]!);
    });
  }

  async findFile(
    userId: string,
    filmId: string,
    fileId: string,
  ): Promise<FileRecord | null> {
    return this.transaction(userId, filmId, async (client) => {
      const res = await client.query<FileRow>(
        `SELECT * FROM files WHERE film_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [filmId, fileId],
      );
      if (res.rows.length === 0) return null;
      return this.mapFile(res.rows[0]!);
    });
  }

  async updateFileStatus(
    userId: string,
    filmId: string,
    fileId: string,
    status: FileRecord['status'],
    quarantineReason?: string,
  ): Promise<FileRecord> {
    return this.transaction(userId, filmId, async (client) => {
      const res = await client.query<FileRow>(
        `UPDATE files
         SET status = $1,
             quarantine_reason = $2,
             updated_at = now()
         WHERE film_id = $3 AND id = $4
         RETURNING *`,
        [status, quarantineReason ?? null, filmId, fileId],
      );
      if (res.rows.length === 0) {
        throw new Error(`File ${fileId} not found`);
      }
      return this.mapFile(res.rows[0]!);
    });
  }

  async createJob(
    userId: string,
    filmId: string,
    input: {
      queueName: 'exports' | 'imports' | 'notifications' | 'ai-proposals';
      jobType: string;
      idempotencyKey?: string;
      payload: Record<string, unknown>;
      maxAttempts?: number;
    },
  ): Promise<BackgroundJobRecord> {
    return this.transaction(userId, filmId, async (client) => {
      // Check idempotency
      if (input.idempotencyKey) {
        const existing = await client.query<JobRow>(
          `SELECT * FROM background_jobs
           WHERE film_id = $1 AND idempotency_key = $2`,
          [filmId, input.idempotencyKey],
        );
        if (existing.rows.length > 0) {
          return this.mapJob(existing.rows[0]!);
        }
      }

      const jobId = randomUUID();
      const res = await client.query<JobRow>(
        `INSERT INTO background_jobs (
           id, film_id, creator_user_id, queue_name, job_type,
           idempotency_key, status, payload, max_attempts
         ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8)
         RETURNING *`,
        [
          jobId,
          filmId,
          userId,
          input.queueName,
          input.jobType,
          input.idempotencyKey ?? null,
          input.payload,
          input.maxAttempts ?? 3,
        ],
      );

      return this.mapJob(res.rows[0]!);
    });
  }

  async findJob(
    userId: string,
    filmId: string,
    jobId: string,
  ): Promise<BackgroundJobRecord | null> {
    return this.transaction(userId, filmId, async (client) => {
      const res = await client.query<JobRow>(
        `SELECT * FROM background_jobs WHERE film_id = $1 AND id = $2`,
        [filmId, jobId],
      );
      if (res.rows.length === 0) return null;
      return this.mapJob(res.rows[0]!);
    });
  }

  async updateJobExecution(
    userId: string,
    filmId: string,
    jobId: string,
    update: {
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'dead_letter';
      result?: Record<string, unknown>;
      errorCode?: string;
      errorMessage?: string;
      incrementAttempt?: boolean;
    },
  ): Promise<BackgroundJobRecord> {
    return this.transaction(userId, filmId, async (client) => {
      const res = await client.query<JobRow>(
        `UPDATE background_jobs
         SET status = $1,
             result = COALESCE($2, result),
             error_code = COALESCE($3, error_code),
             error_message = COALESCE($4, error_message),
             attempt_count = attempt_count + (CASE WHEN $5::boolean THEN 1 ELSE 0 END),
             updated_at = now()
         WHERE film_id = $6 AND id = $7
         RETURNING *`,
        [
          update.status,
          update.result ? JSON.stringify(update.result) : null,
          update.errorCode ?? null,
          update.errorMessage ?? null,
          Boolean(update.incrementAttempt),
          filmId,
          jobId,
        ],
      );
      if (res.rows.length === 0) {
        throw new Error(`Job ${jobId} not found`);
      }
      return this.mapJob(res.rows[0]!);
    });
  }

  private mapFile(row: FileRow): FileRecord {
    return {
      id: row.id,
      filmId: row.film_id,
      uploaderUserId: row.uploader_user_id,
      storageKey: row.storage_key,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sha256Hex: row.sha256.toString('hex'),
      status: row.status as FileRecord['status'],
      ...(row.quarantine_reason !== null && row.quarantine_reason !== undefined
        ? { quarantineReason: row.quarantine_reason }
        : {}),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapJob(row: JobRow): BackgroundJobRecord {
    return {
      id: row.id,
      filmId: row.film_id,
      creatorUserId: row.creator_user_id,
      queueName: row.queue_name as BackgroundJobRecord['queueName'],
      jobType: row.job_type,
      ...(row.idempotency_key !== null && row.idempotency_key !== undefined
        ? { idempotencyKey: row.idempotency_key }
        : {}),
      status: row.status as BackgroundJobRecord['status'],
      payload: row.payload,
      ...(row.result !== null && row.result !== undefined ? { result: row.result } : {}),
      ...(row.error_code !== null && row.error_code !== undefined
        ? { errorCode: row.error_code }
        : {}),
      ...(row.error_message !== null && row.error_message !== undefined
        ? { errorMessage: row.error_message }
        : {}),
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      nextRunAt: new Date(row.next_run_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
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
