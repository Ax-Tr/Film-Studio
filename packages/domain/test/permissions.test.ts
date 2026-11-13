import { describe, expect, it } from 'vitest';
import {
  asFilmId,
  asUserId,
  evaluateFilmPermission,
  type FilmAccessSnapshot,
} from '../src/index.js';

const baseSnapshot: FilmAccessSnapshot = {
  filmId: asFilmId('018f4ce4-5b7b-7b1f-8d9e-07a1f1f7f803'),
  userId: asUserId('018f4ce4-7a86-7f2e-96df-bf4e914f21d4'),
  membershipStatus: 'active',
  accountSuspended: false,
  sessionRevoked: false,
  grants: [{ permission: 'film.read', effect: 'allow', source: 'role' }],
};

describe('film permission evaluation', () => {
  it('allows an explicit active grant', () => {
    expect(evaluateFilmPermission(baseSnapshot, 'film.read')).toEqual({
      allowed: true,
      reason: 'allowed',
    });
  });

  it('lets an explicit deny override role allow', () => {
    const result = evaluateFilmPermission(
      {
        ...baseSnapshot,
        grants: [
          ...baseSnapshot.grants,
          {
            permission: 'film.read',
            effect: 'deny',
            source: 'membership-override',
          },
        ],
      },
      'film.read',
    );
    expect(result.reason).toBe('explicitly_denied');
  });

  it.each([
    ['accountSuspended', 'account_suspended'],
    ['sessionRevoked', 'session_revoked'],
  ] as const)('fails closed for %s', (field, reason) => {
    expect(
      evaluateFilmPermission({ ...baseSnapshot, [field]: true }, 'film.read'),
    ).toEqual({ allowed: false, reason });
  });

  it('denies an ungranted permission', () => {
    expect(evaluateFilmPermission(baseSnapshot, 'film.delete').reason).toBe(
      'not_granted',
    );
  });
});
