import { describe, expect, it } from 'vitest';
import { InMemorySessionRepository } from '../src/modules/auth/in-memory-session.repository.js';
import {
  InvalidSessionTokenError,
  RefreshTokenReplayError,
  SessionService,
} from '../src/modules/auth/session.service.js';

const userId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const deviceId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const initialTime = new Date('2026-11-13T00:00:00.000Z');

function setup() {
  const repository = new InMemorySessionRepository();
  const service = new SessionService(repository, {
    accessTokenTtlSeconds: 300,
    refreshTokenTtlSeconds: 3600,
  });
  return { repository, service };
}

describe('SessionService', () => {
  it('issues and authenticates an opaque access token', async () => {
    const { service } = setup();
    const issued = await service.issue(userId, deviceId, initialTime);
    const principal = await service.authenticate(
      issued.tokens.accessToken,
      new Date(initialTime.getTime() + 1_000),
    );
    expect(principal.userId).toBe(userId);
    expect(issued.tokens.accessToken).not.toContain(userId);
  });

  it('rejects an expired access token', async () => {
    const { service } = setup();
    const issued = await service.issue(userId, deviceId, initialTime);
    await expect(
      service.authenticate(
        issued.tokens.accessToken,
        new Date(initialTime.getTime() + 301_000),
      ),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('rotates both tokens and invalidates the prior access token', async () => {
    const { service } = setup();
    const issued = await service.issue(userId, deviceId, initialTime);
    const rotated = await service.refresh(
      issued.tokens.refreshToken,
      new Date(initialTime.getTime() + 60_000),
    );
    expect(rotated.tokens.refreshToken).not.toBe(issued.tokens.refreshToken);
    await expect(
      service.authenticate(
        issued.tokens.accessToken,
        new Date(initialTime.getTime() + 61_000),
      ),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('detects refresh replay and revokes the active token family', async () => {
    const { service } = setup();
    const issued = await service.issue(userId, deviceId, initialTime);
    const rotated = await service.refresh(
      issued.tokens.refreshToken,
      new Date(initialTime.getTime() + 60_000),
    );
    await expect(
      service.refresh(
        issued.tokens.refreshToken,
        new Date(initialTime.getTime() + 61_000),
      ),
    ).rejects.toBeInstanceOf(RefreshTokenReplayError);
    await expect(
      service.authenticate(
        rotated.tokens.accessToken,
        new Date(initialTime.getTime() + 62_000),
      ),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('revokes a session immediately', async () => {
    const { service } = setup();
    const issued = await service.issue(userId, deviceId, initialTime);
    expect(
      await service.revoke(
        issued.tokens.sessionId,
        'user_logout',
        new Date(initialTime.getTime() + 1_000),
      ),
    ).toBe(true);
    await expect(
      service.authenticate(
        issued.tokens.accessToken,
        new Date(initialTime.getTime() + 2_000),
      ),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('revokes all sessions for a compromised device', async () => {
    const { repository, service } = setup();
    const first = await service.issue(userId, deviceId, initialTime);
    const second = await service.issue(userId, deviceId, initialTime);
    expect(
      await repository.revokeDevice(
        userId,
        deviceId,
        'device_revoked',
        new Date(initialTime.getTime() + 1_000),
      ),
    ).toBe(2);
    await expect(service.authenticate(first.tokens.accessToken)).rejects.toThrow();
    await expect(service.authenticate(second.tokens.accessToken)).rejects.toThrow();
  });
});
