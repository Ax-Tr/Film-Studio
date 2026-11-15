import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryAuthTransactionRepository } from '../src/modules/auth/in-memory-auth-transaction.repository.js';
import {
  InvalidOidcTransactionError,
  OidcTransactionService,
} from '../src/modules/auth/oidc-transaction.service.js';

const initialTime = new Date('2026-11-13T00:00:00.000Z');

function setup() {
  const repository = new InMemoryAuthTransactionRepository();
  const service = new OidcTransactionService(
    repository,
    randomBytes(32).toString('base64url'),
    600,
  );
  return service;
}

describe('OidcTransactionService', () => {
  it('creates an S256 transaction and consumes it once', async () => {
    const service = setup();
    const started = await service.start(
      'web',
      'https://studio.example.test/v1/auth/web/callback',
      initialTime,
    );
    expect(started.state).toHaveLength(43);
    expect(started.nonce).toHaveLength(43);
    expect(started.codeVerifier).toHaveLength(43);
    expect(started.codeChallenge).toHaveLength(43);

    const consumed = await service.consume(
      started.state,
      started.binding,
      new Date(initialTime.getTime() + 1_000),
    );
    expect(consumed.codeVerifier).toBe(started.codeVerifier);

    await expect(
      service.consume(
        started.state,
        started.binding,
        new Date(initialTime.getTime() + 2_000),
      ),
    ).rejects.toBeInstanceOf(InvalidOidcTransactionError);
  });

  it('rejects the wrong browser binding without consuming the transaction', async () => {
    const service = setup();
    const started = await service.start(
      'web',
      'https://studio.example.test/v1/auth/web/callback',
      initialTime,
    );
    await expect(
      service.consume(
        started.state,
        randomBytes(32).toString('base64url'),
        new Date(initialTime.getTime() + 1_000),
      ),
    ).rejects.toBeInstanceOf(InvalidOidcTransactionError);
    await expect(
      service.consume(
        started.state,
        started.binding,
        new Date(initialTime.getTime() + 2_000),
      ),
    ).resolves.toMatchObject({ state: started.state });
  });

  it('rejects an expired transaction', async () => {
    const service = setup();
    const started = await service.start(
      'android',
      'https://studio.example.test/mobile/callback',
      initialTime,
    );
    await expect(
      service.consume(
        started.state,
        started.binding,
        new Date(initialTime.getTime() + 601_000),
      ),
    ).rejects.toBeInstanceOf(InvalidOidcTransactionError);
  });
});
