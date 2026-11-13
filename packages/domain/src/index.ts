declare const filmIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

export type FilmId = string & { readonly [filmIdBrand]: true };
export type UserId = string & { readonly [userIdBrand]: true };

export type FilmMemberStatus = 'invited' | 'active' | 'suspended' | 'revoked';

export interface FilmMembership {
  readonly filmId: FilmId;
  readonly userId: UserId;
  readonly roleIds: readonly string[];
  readonly status: FilmMemberStatus;
}

export function asFilmId(value: string): FilmId {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('FilmId must be a UUID.');
  }
  return value as FilmId;
}

export function asUserId(value: string): UserId {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('UserId must be a UUID.');
  }
  return value as UserId;
}

export interface PermissionGrant {
  readonly permission: string;
  readonly effect: 'allow' | 'deny';
  readonly source: 'ownership' | 'role' | 'membership-override';
}

export interface FilmAccessSnapshot {
  readonly filmId: FilmId;
  readonly userId: UserId;
  readonly membershipStatus: FilmMemberStatus;
  readonly accountSuspended: boolean;
  readonly sessionRevoked: boolean;
  readonly grants: readonly PermissionGrant[];
}

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason:
    | 'allowed'
    | 'account_suspended'
    | 'session_revoked'
    | 'membership_inactive'
    | 'explicitly_denied'
    | 'not_granted';
}

export function evaluateFilmPermission(
  snapshot: FilmAccessSnapshot,
  permission: string,
): PermissionDecision {
  if (snapshot.accountSuspended) {
    return { allowed: false, reason: 'account_suspended' };
  }
  if (snapshot.sessionRevoked) {
    return { allowed: false, reason: 'session_revoked' };
  }
  if (snapshot.membershipStatus !== 'active') {
    return { allowed: false, reason: 'membership_inactive' };
  }

  const matching = snapshot.grants.filter(
    (grant) => grant.permission === permission || grant.permission === '*',
  );
  if (matching.some((grant) => grant.effect === 'deny')) {
    return { allowed: false, reason: 'explicitly_denied' };
  }
  if (matching.some((grant) => grant.effect === 'allow')) {
    return { allowed: true, reason: 'allowed' };
  }
  return { allowed: false, reason: 'not_granted' };
}
