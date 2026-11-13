import type { AuthPlatform } from './oidc-transaction.types.js';
import type { IdentityClaims } from './standard-oidc.client.js';

export interface ResolveIdentityRequest {
  readonly claims: IdentityClaims;
  readonly deviceId: string;
  readonly platform: AuthPlatform;
  readonly now: Date;
}

export interface ResolvedIdentity {
  readonly userId: string;
  readonly deviceId: string;
}

export interface IdentityRepository {
  resolveOrProvision(request: ResolveIdentityRequest): Promise<ResolvedIdentity>;
}
