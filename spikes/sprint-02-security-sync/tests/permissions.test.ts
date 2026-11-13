import { describe, expect, it } from 'vitest'
import { canAccessFilm, effectivePermissions, type FilmMembership } from '../src/permissions.js'

const now = new Date('2026-11-13T10:00:00.000Z')

describe('film-scoped authorization reference policy', () => {
  it('gives the same user different permissions in different films', () => {
    const writer: FilmMembership = { userId: 'u1', filmId: 'film-a', roles: ['screenwriter'] }
    const reviewer: FilmMembership = { userId: 'u1', filmId: 'film-b', roles: ['reviewer'] }

    expect(effectivePermissions(writer).has('creative.edit')).toBe(true)
    expect(effectivePermissions(reviewer).has('creative.edit')).toBe(false)
  })

  it('applies explicit deny after role grants', () => {
    const membership: FilmMembership = {
      userId: 'u1',
      filmId: 'film-a',
      roles: ['producer'],
      deny: ['budget.manage'],
    }

    expect(effectivePermissions(membership).has('budget.read')).toBe(true)
    expect(effectivePermissions(membership).has('budget.manage')).toBe(false)
  })

  it('revokes all film access when membership is revoked', () => {
    const membership: FilmMembership = {
      userId: 'u1',
      filmId: 'film-a',
      roles: ['film_admin'],
      revokedAt: '2026-11-13T09:00:00.000Z',
    }

    expect(effectivePermissions(membership).size).toBe(0)
  })

  it('does not let Super Admin read film content without a scoped break-glass grant', () => {
    expect(canAccessFilm({
      userId: 'super-1',
      filmId: 'film-a',
      permission: 'creative.read',
      isSuperAdmin: true,
      now,
    })).toBe(false)
  })

  it('accepts only an active, reason-bound, film-scoped break-glass permission', () => {
    expect(canAccessFilm({
      userId: 'super-1',
      filmId: 'film-a',
      permission: 'creative.read',
      isSuperAdmin: true,
      breakGlass: {
        grantId: 'grant-1',
        superAdminUserId: 'super-1',
        filmId: 'film-a',
        permissions: ['creative.read'],
        reason: 'Investigate owner support case 123',
        expiresAt: '2026-11-13T10:15:00.000Z',
      },
      now,
    })).toBe(true)
  })
})
