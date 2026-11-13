import type { Pool, PoolClient } from 'pg';
import {
  asFilmId,
  asUserId,
  type FilmAccessSnapshot,
  type FilmMemberStatus,
  type PermissionGrant,
} from '@film-studio/domain';
import type { AuthorizationRepository } from '../modules/authorization/authorization.repository.js';

interface AccountAccessRow {
  account_status: string;
  session_revoked_at: Date | null;
  session_expires_at: Date;
  membership_status: FilmMemberStatus | null;
  is_owner: boolean;
}

interface GrantRow {
  permission: string;
  effect: 'allow' | 'deny';
  source: 'role' | 'membership-override';
}

export class PostgresAuthorizationRepository
  implements AuthorizationRepository
{
  constructor(private readonly pool: Pool) {}

  async loadFilmAccess(
    userId: string,
    sessionId: string,
    filmId: string,
  ): Promise<FilmAccessSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setScope(client, userId, filmId);
      const access = await client.query<AccountAccessRow>(
        `SELECT account.status AS account_status,
           session_record.revoked_at AS session_revoked_at,
           session_record.refresh_expires_at AS session_expires_at,
           membership.status AS membership_status,
           (film.owner_user_id = account.id) AS is_owner
         FROM users account
         JOIN sessions session_record
           ON session_record.user_id = account.id AND session_record.id = $2
         LEFT JOIN film_memberships membership
           ON membership.user_id = account.id AND membership.film_id = $3
         LEFT JOIN films film ON film.id = $3
         WHERE account.id = $1`,
        [userId, sessionId, filmId],
      );
      const row = access.rows[0];
      const grants: PermissionGrant[] =
        row?.membership_status === 'active'
          ? await this.loadGrants(client, userId, filmId)
          : [];
      if (row?.membership_status === 'active' && row.is_owner) {
        grants.push({ permission: '*', effect: 'allow', source: 'ownership' });
      }
      await client.query('COMMIT');
      return {
        filmId: asFilmId(filmId),
        userId: asUserId(userId),
        membershipStatus: row?.membership_status ?? 'revoked',
        accountSuspended: row?.account_status !== 'active',
        sessionRevoked:
          row === undefined ||
          row.session_revoked_at !== null ||
          row.session_expires_at <= new Date(),
        grants,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadGrants(
    client: PoolClient,
    userId: string,
    filmId: string,
  ): Promise<PermissionGrant[]> {
    const result = await client.query<GrantRow>(
      `SELECT role_permission.permission_key AS permission,
          role_permission.effect, 'role'::text AS source
       FROM membership_roles membership_role
       JOIN role_permissions role_permission
         ON role_permission.film_id = membership_role.film_id
        AND role_permission.role_id = membership_role.role_id
       WHERE membership_role.film_id = $1 AND membership_role.user_id = $2
       UNION ALL
       SELECT permission_key AS permission, effect,
         'membership-override'::text AS source
       FROM membership_permission_overrides
       WHERE film_id = $1 AND user_id = $2`,
      [filmId, userId],
    );
    return result.rows;
  }

  private async setScope(
    client: PoolClient,
    userId: string,
    filmId: string,
  ): Promise<void> {
    await client.query(
      `SELECT set_config('app.user_id', $1, true),
              set_config('app.film_id', $2, true)`,
      [userId, filmId],
    );
  }
}
