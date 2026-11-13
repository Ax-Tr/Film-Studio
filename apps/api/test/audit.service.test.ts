import { describe, expect, it } from 'vitest';
import type { AuditEventEnvelope } from '@film-studio/contracts';
import { AuditService, type AuditRepository } from '../src/modules/audit/audit.service.js';

class CapturingAuditRepository implements AuditRepository {
  readonly events: AuditEventEnvelope[] = [];
  readonly sourceHashes: (Uint8Array | undefined)[] = [];

  async insert(event: AuditEventEnvelope, sourceIpHash?: Uint8Array): Promise<void> {
    this.events.push(event);
    this.sourceHashes.push(sourceIpHash);
  }
}

describe('AuditService', () => {
  it('stores redacted metadata and hashes network identifiers', async () => {
    const repository = new CapturingAuditRepository();
    const service = new AuditService(repository);
    const event = await service.record({
      actorUserId: '018f4ce4-7a86-7f2e-96df-bf4e914f21d4',
      action: 'auth.login',
      outcome: 'success',
      requestId: 'request-1234',
      sourceIp: '203.0.113.10',
      metadata: { platform: 'web', mfa: false },
    });
    expect(event.metadata).toEqual({ platform: 'web', mfa: false });
    expect(repository.sourceHashes[0]).toHaveLength(32);
  });

  it.each(['accessToken', 'screenplayContent', 'providerSecret', 'email']) (
    'rejects sensitive metadata key %s',
    async (key) => {
      const service = new AuditService(new CapturingAuditRepository());
      await expect(
        service.record({
          action: 'auth.login',
          outcome: 'failed',
          requestId: 'request-1234',
          metadata: { [key]: 'sensitive' },
        }),
      ).rejects.toThrow('not allowed');
    },
  );
});
