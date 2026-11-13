import type { AuthenticatedPrincipal, SessionTokenPair } from '@film-studio/contracts';

export type SessionRevokeReason =
  | 'user_logout'
  | 'user_revoke'
  | 'admin_security'
  | 'replay_detected'
  | 'device_revoked'
  | 'account_suspended';

export interface SessionRecord {
  readonly id: string;
  readonly familyId: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly accessTokenHash: string;
  readonly refreshTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly refreshExpiresAt: Date;
  readonly authenticatedAt: Date;
  readonly revokedAt?: Date;
  readonly revokeReason?: SessionRevokeReason;
}

export type NewSessionRecord = SessionRecord;

export interface SessionRotation {
  readonly accessTokenHash: string;
  readonly refreshTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly refreshExpiresAt: Date;
}

export type RotationResult =
  | { readonly kind: 'rotated'; readonly session: SessionRecord }
  | { readonly kind: 'replay'; readonly familyId: string }
  | { readonly kind: 'invalid' };

export interface SessionRepository {
  create(record: NewSessionRecord): Promise<void>;
  findByAccessTokenHash(hash: string, now: Date): Promise<SessionRecord | undefined>;
  rotateRefreshToken(
    presentedHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<RotationResult>;
  revokeSession(
    sessionId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean>;
  revokeDevice(
    userId: string,
    deviceId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<number>;
}

export interface IssuedSession {
  readonly principal: AuthenticatedPrincipal;
  readonly tokens: SessionTokenPair;
}
