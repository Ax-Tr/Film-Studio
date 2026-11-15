import { describe, expect, it } from 'vitest';
import {
  asFilmId,
  asUserId,
  type FilmAccessSnapshot,
} from '@film-studio/domain';
import type { AuthorizationRepository } from '../src/modules/authorization/authorization.repository.js';
import {
  FilmPermissionDeniedError,
  PermissionService,
} from '../src/modules/authorization/permission.service.js';

const userId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const sessionId = '018f4ce4-daa8-743f-9430-22e49a5f6197';
const filmId = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';

class FixedAuthorizationRepository implements AuthorizationRepository {
  constructor(private readonly snapshot: FilmAccessSnapshot) {}

  async loadFilmAccess(): Promise<FilmAccessSnapshot> {
    return this.snapshot;
  }
}

function snapshot(
  overrides: Partial<FilmAccessSnapshot> = {},
): FilmAccessSnapshot {
  return {
    filmId: asFilmId(filmId),
    userId: asUserId(userId),
    membershipStatus: 'active',
    accountSuspended: false,
    sessionRevoked: false,
    grants: [
      { permission: 'film.read', effect: 'allow', source: 'role' },
    ],
    ...overrides,
  };
}

describe('PermissionService', () => {
  it('allows a server-resolved active grant', async () => {
    const service = new PermissionService(
      new FixedAuthorizationRepository(snapshot()),
    );
    await expect(
      service.requireFilmPermission(userId, sessionId, filmId, 'film.read'),
    ).resolves.toBeUndefined();
  });

  it('denies revoked membership even when a stale grant exists', async () => {
    const service = new PermissionService(
      new FixedAuthorizationRepository(
        snapshot({ membershipStatus: 'revoked' }),
      ),
    );
    await expect(
      service.requireFilmPermission(userId, sessionId, filmId, 'film.read'),
    ).rejects.toBeInstanceOf(FilmPermissionDeniedError);
  });
});
