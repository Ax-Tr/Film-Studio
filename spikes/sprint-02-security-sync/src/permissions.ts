export const filmPermissions = [
  'film.manage_settings',
  'film.manage_members',
  'film.transfer_ownership',
  'film.request_deletion',
  'creative.read',
  'creative.edit',
  'creative.approve',
  'creative.lock',
  'characters.manage',
  'scenes.manage',
  'continuity.manage',
  'comments.create',
  'comments.moderate',
  'production.read',
  'production.manage',
  'schedule.manage',
  'budget.read',
  'budget.manage',
  'budget.approve',
  'ai.use',
  'ai.configure_provider',
  'ai.view_history',
  'files.upload',
  'files.download',
  'exports.create',
  'exports.download',
  'audit.read',
] as const

export type FilmPermission = (typeof filmPermissions)[number]
export type FilmRole =
  | 'film_owner'
  | 'film_admin'
  | 'director'
  | 'producer'
  | 'screenwriter'
  | 'co_writer'
  | 'dialogue_writer'
  | 'script_editor'
  | 'production_manager'
  | 'reviewer'

const all = new Set<FilmPermission>(filmPermissions)
const creativeRead = ['creative.read', 'comments.create'] as const satisfies readonly FilmPermission[]
const creativeEdit = [
  ...creativeRead,
  'creative.edit',
  'characters.manage',
  'scenes.manage',
  'continuity.manage',
  'files.upload',
] as const satisfies readonly FilmPermission[]

export const defaultRolePermissions: Record<FilmRole, ReadonlySet<FilmPermission>> = {
  film_owner: all,
  film_admin: new Set(filmPermissions.filter((permission) => permission !== 'film.transfer_ownership')),
  director: new Set([
    ...creativeEdit,
    'creative.approve',
    'creative.lock',
    'comments.moderate',
    'production.read',
    'files.download',
    'exports.create',
    'exports.download',
    'ai.use',
    'ai.view_history',
  ]),
  producer: new Set([
    ...creativeRead,
    'film.manage_members',
    'production.read',
    'production.manage',
    'schedule.manage',
    'budget.read',
    'budget.manage',
    'budget.approve',
    'files.upload',
    'files.download',
    'exports.create',
    'exports.download',
    'audit.read',
    'ai.use',
    'ai.view_history',
  ]),
  screenwriter: new Set([
    ...creativeEdit,
    'files.download',
    'exports.create',
    'exports.download',
    'ai.use',
    'ai.view_history',
  ]),
  co_writer: new Set([...creativeEdit, 'files.download', 'ai.use', 'ai.view_history']),
  dialogue_writer: new Set([...creativeRead, 'creative.edit', 'ai.use']),
  script_editor: new Set([
    ...creativeEdit,
    'comments.moderate',
    'files.download',
    'exports.create',
    'exports.download',
    'ai.use',
    'ai.view_history',
  ]),
  production_manager: new Set([
    ...creativeRead,
    'production.read',
    'production.manage',
    'schedule.manage',
    'budget.read',
    'budget.manage',
    'files.upload',
    'files.download',
    'exports.create',
    'exports.download',
  ]),
  reviewer: new Set([...creativeRead]),
}

export interface FilmMembership {
  userId: string
  filmId: string
  roles: FilmRole[]
  allow?: FilmPermission[]
  deny?: FilmPermission[]
  revokedAt?: string
}

export interface BreakGlassGrant {
  grantId: string
  superAdminUserId: string
  filmId: string
  permissions: FilmPermission[]
  reason: string
  expiresAt: string
}

export function effectivePermissions(membership: FilmMembership): Set<FilmPermission> {
  if (membership.revokedAt) return new Set()
  const permissions = new Set<FilmPermission>()
  for (const role of membership.roles) {
    for (const permission of defaultRolePermissions[role]) permissions.add(permission)
  }
  for (const permission of membership.allow ?? []) permissions.add(permission)
  for (const permission of membership.deny ?? []) permissions.delete(permission)
  return permissions
}

export function canAccessFilm(input: {
  userId: string
  filmId: string
  permission: FilmPermission
  membership?: FilmMembership
  isSuperAdmin?: boolean
  breakGlass?: BreakGlassGrant
  now: Date
}): boolean {
  const { membership } = input
  if (
    membership?.userId === input.userId
    && membership.filmId === input.filmId
    && effectivePermissions(membership).has(input.permission)
  ) return true

  if (!input.isSuperAdmin || !input.breakGlass) return false
  return input.breakGlass.superAdminUserId === input.userId
    && input.breakGlass.filmId === input.filmId
    && input.breakGlass.reason.trim().length >= 10
    && new Date(input.breakGlass.expiresAt).getTime() > input.now.getTime()
    && input.breakGlass.permissions.includes(input.permission)
}
