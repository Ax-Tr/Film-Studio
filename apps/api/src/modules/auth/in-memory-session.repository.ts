import type {
  NewSessionRecord,
  RotationResult,
  SessionRecord,
  SessionRepository,
  SessionRevokeReason,
  SessionRotation,
} from './session.types.js';

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly usedRefreshTokens = new Map<string, string>();

  async create(record: NewSessionRecord): Promise<void> {
    this.sessions.set(record.id, record);
  }

  async findByAccessTokenHash(
    hash: string,
    now: Date,
  ): Promise<SessionRecord | undefined> {
    return [...this.sessions.values()].find(
      (session) =>
        session.accessTokenHash === hash &&
        session.revokedAt === undefined &&
        session.accessExpiresAt > now,
    );
  }

  async rotateRefreshToken(
    presentedHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<RotationResult> {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.refreshTokenHash === presentedHash,
    );
    if (session === undefined) {
      const replayedFamilyId = this.usedRefreshTokens.get(presentedHash);
      if (replayedFamilyId === undefined) return { kind: 'invalid' };
      this.revokeFamily(replayedFamilyId, now);
      return { kind: 'replay', familyId: replayedFamilyId };
    }
    if (session.revokedAt !== undefined || session.refreshExpiresAt <= now) {
      return { kind: 'invalid' };
    }

    this.usedRefreshTokens.set(presentedHash, session.familyId);
    const rotated: SessionRecord = { ...session, ...replacement };
    this.sessions.set(session.id, rotated);
    return { kind: 'rotated', session: rotated };
  }

  async revokeSession(
    sessionId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.revokedAt !== undefined) return false;
    this.sessions.set(sessionId, { ...session, revokedAt: now, revokeReason: reason });
    return true;
  }

  async revokeDevice(
    userId: string,
    deviceId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.deviceId === deviceId &&
        session.revokedAt === undefined
      ) {
        this.sessions.set(session.id, {
          ...session,
          revokedAt: now,
          revokeReason: reason,
        });
        revoked += 1;
      }
    }
    return revoked;
  }

  private revokeFamily(familyId: string, now: Date): void {
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId && session.revokedAt === undefined) {
        this.sessions.set(session.id, {
          ...session,
          revokedAt: now,
          revokeReason: 'replay_detected',
        });
      }
    }
  }
}
