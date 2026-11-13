import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal, SessionTokenPair } from '@film-studio/contracts';
import type {
  IssuedSession,
  SessionRecord,
  SessionRepository,
  SessionRevokeReason,
  SessionRotation,
} from './session.types.js';

export class InvalidSessionTokenError extends Error {
  readonly code = 'INVALID_SESSION_TOKEN';
}

export class RefreshTokenReplayError extends Error {
  readonly code = 'REFRESH_TOKEN_REPLAY';
}

export interface SessionServiceOptions {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
}

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly options: SessionServiceOptions,
  ) {}

  async issue(
    userId: string,
    deviceId: string,
    now = new Date(),
  ): Promise<IssuedSession> {
    const accessToken = opaqueToken();
    const refreshToken = opaqueToken();
    const sessionId = randomUUID();
    const accessExpiresAt = new Date(
      now.getTime() + this.options.accessTokenTtlSeconds * 1000,
    );
    const refreshExpiresAt = new Date(
      now.getTime() + this.options.refreshTokenTtlSeconds * 1000,
    );
    const record: SessionRecord = {
      id: sessionId,
      familyId: randomUUID(),
      userId,
      deviceId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      authenticatedAt: now,
    };
    await this.repository.create(record);
    return this.issued(record, accessToken, refreshToken);
  }

  async authenticate(
    accessToken: string,
    now = new Date(),
  ): Promise<AuthenticatedPrincipal> {
    const record = await this.repository.findByAccessTokenHash(
      hashToken(accessToken),
      now,
    );
    if (record === undefined) throw new InvalidSessionTokenError();
    return this.principal(record);
  }

  async refresh(
    refreshToken: string,
    now = new Date(),
  ): Promise<IssuedSession> {
    const nextAccessToken = opaqueToken();
    const nextRefreshToken = opaqueToken();
    const rotation: SessionRotation = {
      accessTokenHash: hashToken(nextAccessToken),
      refreshTokenHash: hashToken(nextRefreshToken),
      accessExpiresAt: new Date(
        now.getTime() + this.options.accessTokenTtlSeconds * 1000,
      ),
      refreshExpiresAt: new Date(
        now.getTime() + this.options.refreshTokenTtlSeconds * 1000,
      ),
    };
    const result = await this.repository.rotateRefreshToken(
      hashToken(refreshToken),
      rotation,
      now,
    );
    if (result.kind === 'replay') throw new RefreshTokenReplayError();
    if (result.kind === 'invalid') throw new InvalidSessionTokenError();
    return this.issued(result.session, nextAccessToken, nextRefreshToken);
  }

  revoke(
    sessionId: string,
    reason: SessionRevokeReason,
    now = new Date(),
  ): Promise<boolean> {
    return this.repository.revokeSession(sessionId, reason, now);
  }

  private issued(
    record: SessionRecord,
    accessToken: string,
    refreshToken: string,
  ): IssuedSession {
    const tokens: SessionTokenPair = {
      accessToken,
      accessTokenExpiresAt: record.accessExpiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: record.refreshExpiresAt.toISOString(),
      sessionId: record.id,
      deviceId: record.deviceId,
    };
    return { principal: this.principal(record), tokens };
  }

  private principal(record: SessionRecord): AuthenticatedPrincipal {
    return {
      userId: record.userId,
      sessionId: record.id,
      deviceId: record.deviceId,
      authenticationTime: record.authenticatedAt.toISOString(),
    };
  }
}
