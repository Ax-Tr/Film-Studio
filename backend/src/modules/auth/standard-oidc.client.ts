import { z } from 'zod';
import * as oidc from 'openid-client';
import type { OidcTransactionPayload, StartedOidcTransaction } from './oidc-transaction.types.js';

const identityClaimsSchema = z.object({
  iss: z.string().url(),
  sub: z.string().min(1).max(255),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().min(1).max(160).optional(),
  auth_time: z.number().int().nonnegative().optional(),
});

export type IdentityClaims = z.infer<typeof identityClaimsSchema>;

export interface StandardOidcClientOptions {
  readonly issuer: URL;
  readonly clientId: string;
  readonly clientSecret?: string;
}

export interface OidcClient {
  authorizationUrl(transaction: StartedOidcTransaction): Promise<URL>;
  exchange(
    callbackUrl: URL,
    transaction: OidcTransactionPayload,
  ): Promise<IdentityClaims>;
}

export class StandardOidcClient implements OidcClient {
  private configurationPromise?: Promise<oidc.Configuration>;

  constructor(private readonly options: StandardOidcClientOptions) {
    if (options.issuer.protocol !== 'https:') {
      throw new Error('OIDC issuer must use HTTPS.');
    }
  }

  async authorizationUrl(transaction: StartedOidcTransaction): Promise<URL> {
    const configuration = await this.configuration();
    return oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: transaction.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: transaction.codeChallenge,
      code_challenge_method: 'S256',
      state: transaction.state,
      nonce: transaction.nonce,
    });
  }

  async exchange(
    callbackUrl: URL,
    transaction: OidcTransactionPayload,
  ): Promise<IdentityClaims> {
    const configuration = await this.configuration();
    const tokens = await oidc.authorizationCodeGrant(configuration, callbackUrl, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (claims === undefined) throw new Error('OIDC provider omitted the ID token.');
    return identityClaimsSchema.parse(claims);
  }

  private configuration(): Promise<oidc.Configuration> {
    this.configurationPromise ??= oidc.discovery(
      this.options.issuer,
      this.options.clientId,
      this.options.clientSecret,
      this.options.clientSecret === undefined
        ? oidc.None()
        : oidc.ClientSecretPost(this.options.clientSecret),
    );
    return this.configurationPromise;
  }
}
