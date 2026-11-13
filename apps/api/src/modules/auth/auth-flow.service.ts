import type { IssuedSession } from './session.types.js';
import type { AuthPlatform, StartedOidcTransaction } from './oidc-transaction.types.js';
import type { IdentityRepository } from './identity.repository.js';
import type { OidcTransactionService } from './oidc-transaction.service.js';
import type { SessionService } from './session.service.js';
import type { OidcClient } from './standard-oidc.client.js';

export interface StartedAuthentication {
  readonly authorizationUrl: URL;
  readonly binding: string;
  readonly expiresAt: Date;
}

export class AuthFlowService {
  constructor(
    private readonly transactions: OidcTransactionService,
    private readonly oidcClient: OidcClient,
    private readonly identities: IdentityRepository,
    private readonly sessions: SessionService,
  ) {}

  async start(
    platform: AuthPlatform,
    redirectUri: string,
    now = new Date(),
  ): Promise<StartedAuthentication> {
    const transaction: StartedOidcTransaction = await this.transactions.start(
      platform,
      redirectUri,
      now,
    );
    return {
      authorizationUrl: await this.oidcClient.authorizationUrl(transaction),
      binding: transaction.binding,
      expiresAt: transaction.expiresAt,
    };
  }

  async complete(
    callbackUrl: URL,
    binding: string,
    deviceId: string,
    now = new Date(),
  ): Promise<IssuedSession> {
    const state = callbackUrl.searchParams.get('state');
    if (state === null) throw new Error('OIDC callback state is missing.');
    const transaction = await this.transactions.consume(state, binding, now);
    this.assertCallbackMatches(callbackUrl, transaction.redirectUri);
    const claims = await this.oidcClient.exchange(callbackUrl, transaction);
    const identity = await this.identities.resolveOrProvision({
      claims,
      deviceId,
      platform: transaction.platform,
      now,
    });
    return this.sessions.issue(identity.userId, identity.deviceId, now);
  }

  private assertCallbackMatches(callbackUrl: URL, redirectUri: string): void {
    const actual = new URL(callbackUrl);
    actual.search = '';
    actual.hash = '';
    const expected = new URL(redirectUri);
    expected.search = '';
    expected.hash = '';
    if (actual.href !== expected.href) {
      throw new Error('OIDC callback URI does not match the initiated transaction.');
    }
  }
}
