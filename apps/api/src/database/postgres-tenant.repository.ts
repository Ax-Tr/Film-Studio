import type { Pool, PoolClient } from 'pg';
import type {
  AccessibleFilm,
  CreateInvitationRecord,
  TenantRepository,
} from '../modules/tenant/tenant.repository.js';

interface FilmRow {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  permission_revision: string;
}

export class PostgresTenantRepository implements TenantRepository {
  constructor(private readonly pool: Pool) {}

  async createOrganization(
    userId: string,
    organizationId: string,
    name: string,
  ): Promise<void> {
    await this.transaction(userId, undefined, async (client) => {
      await client.query('SELECT app_security.create_organization($1, $2)', [
        organizationId,
        name,
      ]);
    });
  }

  async createFilm(
    userId: string,
    organizationId: string,
    filmId: string,
    title: string,
  ): Promise<void> {
    try {
      await this.transaction(userId, undefined, async (client) => {
        await client.query('SELECT app_security.create_film($1, $2, $3)', [
          filmId,
          organizationId,
          title,
        ]);
      });
    } catch (error) {
      if (
        this.databaseMessage(error) ===
        'organization administration permission is required'
      ) {
        throw this.codedError('ORGANIZATION_PERMISSION_DENIED');
      }
      throw error;
    }
  }

  async listAccessibleFilms(
    userId: string,
  ): Promise<readonly AccessibleFilm[]> {
    return this.transaction(userId, undefined, async (client) => {
      const result = await client.query<FilmRow>(
        'SELECT * FROM app_security.list_accessible_films()',
      );
      return result.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        title: row.title,
        status: row.status,
        permissionRevision: row.permission_revision,
      }));
    });
  }

  async createInvitation(input: CreateInvitationRecord): Promise<void> {
    try {
      await this.transaction(input.invitedBy, input.filmId, async (client) => {
        await client.query(
          `INSERT INTO film_invitations (
             id, film_id, email, token_hash, status, invited_by, expires_at
           ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
          [
            input.id,
            input.filmId,
            input.email,
            input.tokenHash,
            input.invitedBy,
            input.expiresAt,
          ],
        );
        for (const roleId of input.roleIds) {
          await client.query(
            `INSERT INTO film_invitation_roles (film_id, invitation_id, role_id)
             VALUES ($1, $2, $3)`,
            [input.filmId, input.id, roleId],
          );
        }
      });
    } catch (error) {
      if (this.databaseCode(error) === '23505') {
        throw this.codedError('FILM_INVITATION_ALREADY_PENDING');
      }
      throw error;
    }
  }

  async acceptInvitation(
    userId: string,
    tokenHash: Uint8Array,
  ): Promise<string> {
    try {
      return await this.transaction(userId, undefined, async (client) => {
        const result = await client.query<{ film_id: string }>(
          'SELECT app_security.accept_film_invitation($1) AS film_id',
          [tokenHash],
        );
        const filmId = result.rows[0]?.film_id;
        if (filmId === undefined)
          throw new Error('Invitation acceptance failed.');
        return filmId;
      });
    } catch (error) {
      if (
        [
          'invitation is invalid or expired',
          'verified identity email does not match invitation',
        ].includes(this.databaseMessage(error) ?? '')
      ) {
        throw this.codedError('INVALID_FILM_INVITATION');
      }
      throw error;
    }
  }

  private async transaction<T>(
    userId: string,
    filmId: string | undefined,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.film_id', $2, true)`,
        [userId, filmId ?? ''],
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

  private codedError(code: string): Error & { code: string } {
    const error = new Error(code) as Error & { code: string };
    error.code = code;
    return error;
  }

  private databaseCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }

  private databaseMessage(error: unknown): string | undefined {
    return error instanceof Error ? error.message : undefined;
  }
}
