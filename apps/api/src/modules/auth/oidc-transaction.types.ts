export type AuthPlatform = 'web' | 'android' | 'ios';

export interface OidcTransactionPayload {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly platform: AuthPlatform;
}

export interface AuthTransactionRecord {
  readonly id: string;
  readonly stateHash: string;
  readonly bindingHash: string;
  readonly nonceHash: string;
  readonly ciphertext: Uint8Array;
  readonly redirectUri: string;
  readonly platform: AuthPlatform;
  readonly expiresAt: Date;
  readonly consumedAt?: Date;
}

export interface AuthTransactionRepository {
  create(record: AuthTransactionRecord): Promise<void>;
  consume(
    stateHash: string,
    bindingHash: string,
    now: Date,
  ): Promise<AuthTransactionRecord | undefined>;
}

export interface StartedOidcTransaction extends OidcTransactionPayload {
  readonly binding: string;
  readonly codeChallenge: string;
  readonly expiresAt: Date;
}
