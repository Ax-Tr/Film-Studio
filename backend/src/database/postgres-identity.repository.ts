import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  IdentityRepository,
  ResolveIdentityRequest,
  ResolvedIdentity,
} from '../modules/auth/identity.repository.js';

interface IdentityRow {
  user_id: string;
  status: 'active' | 'suspended' | 'deletion_requested' | 'deleted';
}

export class AccountUnavailableError extends Error {
  readonly code = 'ACCOUNT_UNAVAILABLE';
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async resolveOrProvision(
    request: ResolveIdentityRequest,
  ): Promise<ResolvedIdentity> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<IdentityRow>(
        `SELECT identity.user_id, account.status
         FROM auth_identities identity
         JOIN users account ON account.id = identity.user_id
         WHERE identity.issuer = $1 AND identity.subject = $2
         FOR UPDATE OF identity, account`,
        [request.claims.iss, request.claims.sub],
      );
      let identity = found.rows[0];
      if (identity === undefined) {
        const userId = randomUUID();
        await client.query(
          `INSERT INTO users (id, display_name, primary_email)
           VALUES ($1, $2, $3)`,
          [
            userId,
            request.claims.name ?? request.claims.email ?? request.claims.sub,
            request.claims.email ?? null,
          ],
        );
        await client.query(
          `INSERT INTO auth_identities (
            id, user_id, issuer, subject, email_at_provider,
            email_verified, last_authenticated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            userId,
            request.claims.iss,
            request.claims.sub,
            request.claims.email ?? null,
            request.claims.email_verified ?? false,
            request.now,
          ],
        );
        identity = { user_id: userId, status: 'active' };
      } else {
        await client.query(
          `UPDATE auth_identities SET
             email_at_provider = $3,
             email_verified = $4,
             last_authenticated_at = $5
           WHERE issuer = $1 AND subject = $2`,
          [
            request.claims.iss,
            request.claims.sub,
            request.claims.email ?? null,
            request.claims.email_verified ?? false,
            request.now,
          ],
        );
      }
      if (identity.status !== 'active') throw new AccountUnavailableError();

      const device = await client.query<{ status: 'active' | 'revoked' }>(
        `SELECT status FROM devices WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [request.deviceId, identity.user_id],
      );
      const existingDevice = device.rows[0];
      if (existingDevice?.status === 'revoked') throw new AccountUnavailableError();
      if (existingDevice === undefined) {
        await client.query(
          `INSERT INTO devices (id, user_id, platform, last_seen_at)
           VALUES ($1, $2, $3, $4)`,
          [request.deviceId, identity.user_id, request.platform, request.now],
        );
      } else {
        await client.query(
          `UPDATE devices SET last_seen_at = $3
           WHERE id = $1 AND user_id = $2`,
          [request.deviceId, identity.user_id, request.now],
        );
      }
      await client.query('COMMIT');
      return { userId: identity.user_id, deviceId: request.deviceId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
