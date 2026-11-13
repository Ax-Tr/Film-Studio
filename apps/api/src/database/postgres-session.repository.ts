import type { Pool, PoolClient } from 'pg';
import type {
  NewSessionRecord,
  RotationResult,
  SessionRecord,
  SessionRepository,
  SessionRevokeReason,
  SessionRotation,
} from '../modules/auth/session.types.js';

interface SessionRow {
  id: string;
  family_id: string;
  user_id: string;
  device_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  access_expires_at: Date;
  refresh_expires_at: Date;
  authenticated_at: Date;
  revoked_at: Date | null;
  revoke_reason: SessionRevokeReason | null;
}

const sessionColumns = `
  session_record.id, session_record.family_id,
  session_record.user_id, session_record.device_id,
  encode(session_record.access_token_hash, 'hex') AS access_token_hash,
  encode(session_record.refresh_token_hash, 'hex') AS refresh_token_hash,
  session_record.access_expires_at, session_record.refresh_expires_at,
  session_record.authenticated_at, session_record.revoked_at,
  session_record.revoke_reason
`;

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    userId: row.user_id,
    deviceId: row.device_id,
    accessTokenHash: row.access_token_hash,
    refreshTokenHash: row.refresh_token_hash,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    authenticatedAt: row.authenticated_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
    ...(row.revoke_reason === null ? {} : { revokeReason: row.revoke_reason }),
  };
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(record: NewSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (
        id, family_id, user_id, device_id,
        access_token_hash, refresh_token_hash,
        access_expires_at, refresh_expires_at, authenticated_at
      ) VALUES ($1, $2, $3, $4, decode($5, 'hex'), decode($6, 'hex'), $7, $8, $9)`,
      [
        record.id,
        record.familyId,
        record.userId,
        record.deviceId,
        record.accessTokenHash,
        record.refreshTokenHash,
        record.accessExpiresAt,
        record.refreshExpiresAt,
        record.authenticatedAt,
      ],
    );
  }

  async findByAccessTokenHash(
    hash: string,
    now: Date,
  ): Promise<SessionRecord | undefined> {
    const result = await this.pool.query<SessionRow>(
      `SELECT ${sessionColumns}
       FROM sessions session_record
       JOIN users account ON account.id = session_record.user_id
       JOIN devices device ON device.id = session_record.device_id
         AND device.user_id = session_record.user_id
       WHERE session_record.access_token_hash = decode($1, 'hex')
         AND session_record.revoked_at IS NULL
         AND session_record.access_expires_at > $2
         AND session_record.refresh_expires_at > $2
         AND account.status = 'active'
         AND device.status = 'active'`,
      [hash, now],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapSession(row);
  }

  async rotateRefreshToken(
    presentedHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<RotationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<SessionRow>(
        `SELECT ${sessionColumns}
         FROM sessions session_record
         WHERE session_record.refresh_token_hash = decode($1, 'hex')
         FOR UPDATE`,
        [presentedHash],
      );
      const row = current.rows[0];
      if (row === undefined) {
        const replay = await client.query<{ family_id: string }>(
          `SELECT family_id FROM used_refresh_tokens
           WHERE token_hash = decode($1, 'hex') AND expires_at > $2`,
          [presentedHash, now],
        );
        const familyId = replay.rows[0]?.family_id;
        if (familyId === undefined) {
          await client.query('ROLLBACK');
          return { kind: 'invalid' };
        }
        await client.query(
          `UPDATE sessions SET revoked_at = $2, revoke_reason = 'replay_detected'
           WHERE family_id = $1 AND revoked_at IS NULL`,
          [familyId, now],
        );
        await client.query('COMMIT');
        return { kind: 'replay', familyId };
      }
      if (row.revoked_at !== null || row.refresh_expires_at <= now) {
        await client.query('ROLLBACK');
        return { kind: 'invalid' };
      }

      await this.persistRotation(client, row, presentedHash, replacement, now);
      await client.query('COMMIT');
      return {
        kind: 'rotated',
        session: {
          ...mapSession(row),
          ...replacement,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession(
    sessionId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE sessions SET revoked_at = $2, revoke_reason = $3
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, now, reason],
    );
    return result.rowCount === 1;
  }

  async revokeDevice(
    userId: string,
    deviceId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE devices SET status = 'revoked', revoked_at = $3
         WHERE user_id = $1 AND id = $2`,
        [userId, deviceId, now],
      );
      const result = await client.query(
        `UPDATE sessions SET revoked_at = $3, revoke_reason = $4
         WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
        [userId, deviceId, now, reason],
      );
      await client.query('COMMIT');
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async persistRotation(
    client: PoolClient,
    row: SessionRow,
    presentedHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<void> {
    await client.query(
      `INSERT INTO used_refresh_tokens
        (token_hash, session_id, family_id, used_at, expires_at)
       VALUES (decode($1, 'hex'), $2, $3, $4, $5)`,
      [presentedHash, row.id, row.family_id, now, row.refresh_expires_at],
    );
    await client.query(
      `UPDATE sessions SET
        access_token_hash = decode($2, 'hex'),
        refresh_token_hash = decode($3, 'hex'),
        access_expires_at = $4,
        refresh_expires_at = $5,
        last_seen_at = $6
       WHERE id = $1`,
      [
        row.id,
        replacement.accessTokenHash,
        replacement.refreshTokenHash,
        replacement.accessExpiresAt,
        replacement.refreshExpiresAt,
        now,
      ],
    );
  }
}
