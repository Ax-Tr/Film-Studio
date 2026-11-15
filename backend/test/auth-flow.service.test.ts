import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuthFlowService } from '../src/modules/auth/auth-flow.service.js';
import { InMemoryAuthTransactionRepository } from '../src/modules/auth/in-memory-auth-transaction.repository.js';
import { InMemorySessionRepository } from '../src/modules/auth/in-memory-session.repository.js';
import type {
  IdentityRepository,
  ResolveIdentityRequest,
} from '../src/modules/auth/identity.repository.js';
import { OidcTransactionService } from '../src/modules/auth/oidc-transaction.service.js';
import { SessionService } from '../src/modules/auth/session.service.js';
import type {
  IdentityClaims,
  OidcClient,
} from '../src/modules/auth/standard-oidc.client.js';
import type { StartedOidcTransaction } from '../src/modules/auth/oidc-transaction.types.js';

const userId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const deviceId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const redirectUri = 'https://studio.example.test/v1/auth/web/callback';

class FakeOidcClient implements OidcClient {
  async authorizationUrl(transaction: StartedOidcTransaction): Promise<URL> {
    const url = new URL('https://identity.example.test/authorize');
    url.searchParams.set('state', transaction.state);
    url.searchParams.set('nonce', transaction.nonce);
    url.searchParams.set('code_challenge', transaction.codeChallenge);
    return url;
  }

  async exchange(): Promise<IdentityClaims> {
    return {
      iss: 'https://identity.example.test',
      sub: 'provider-subject-123',
      email: 'person@example.test',
      email_verified: true,
      name: 'Synthetic Person',
    };
  }
}

class FakeIdentityRepository implements IdentityRepository {
  lastRequest?: ResolveIdentityRequest;

  async resolveOrProvision(request: ResolveIdentityRequest) {
    this.lastRequest = request;
    return { userId, deviceId: request.deviceId };
  }
}

describe('AuthFlowService', () => {
  it('binds provider identity, device and an internal opaque session', async () => {
    const transactions = new OidcTransactionService(
      new InMemoryAuthTransactionRepository(),
      randomBytes(32).toString('base64url'),
    );
    const identities = new FakeIdentityRepository();
    const sessions = new SessionService(new InMemorySessionRepository(), {
      accessTokenTtlSeconds: 300,
      refreshTokenTtlSeconds: 3600,
    });
    const service = new AuthFlowService(
      transactions,
      new FakeOidcClient(),
      identities,
      sessions,
    );

    const started = await service.start('web', redirectUri);
    const state = started.authorizationUrl.searchParams.get('state');
    expect(state).not.toBeNull();
    const callback = new URL(redirectUri);
    callback.searchParams.set('code', 'single-use-code');
    callback.searchParams.set('state', state ?? '');
    const issued = await service.complete(callback, started.binding, deviceId);

    expect(identities.lastRequest?.claims.sub).toBe('provider-subject-123');
    expect(identities.lastRequest?.platform).toBe('web');
    expect(issued.principal.userId).toBe(userId);
    expect(issued.tokens.accessToken).not.toContain('provider-subject-123');
  });

  it('rejects a callback sent to a different registered URI', async () => {
    const service = new AuthFlowService(
      new OidcTransactionService(
        new InMemoryAuthTransactionRepository(),
        randomBytes(32).toString('base64url'),
      ),
      new FakeOidcClient(),
      new FakeIdentityRepository(),
      new SessionService(new InMemorySessionRepository(), {
        accessTokenTtlSeconds: 300,
        refreshTokenTtlSeconds: 3600,
      }),
    );
    const started = await service.start('web', redirectUri);
    const callback = new URL('https://attacker.example.test/callback');
    callback.searchParams.set('code', 'single-use-code');
    callback.searchParams.set(
      'state',
      started.authorizationUrl.searchParams.get('state') ?? '',
    );
    await expect(
      service.complete(callback, started.binding, deviceId),
    ).rejects.toThrow('does not match');
  });
});
