import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type {
  AuthPlatform,
  AuthTransactionRepository,
  OidcTransactionPayload,
  StartedOidcTransaction,
} from './oidc-transaction.types.js';

export class InvalidOidcTransactionError extends Error {
  readonly code = 'INVALID_OIDC_TRANSACTION';
}

function randomValue(): string {
  return randomBytes(32).toString('base64url');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function pkceChallenge(codeVerifier: string): string {
  return createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url');
}

export class OidcTransactionService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly repository: AuthTransactionRepository,
    encryptionKeyBase64Url: string,
    private readonly ttlSeconds = 600,
  ) {
    this.encryptionKey = Buffer.from(encryptionKeyBase64Url, 'base64url');
    if (this.encryptionKey.length !== 32) {
      throw new Error('OIDC transaction encryption key must contain 32 bytes.');
    }
  }

  async start(
    platform: AuthPlatform,
    redirectUri: string,
    now = new Date(),
  ): Promise<StartedOidcTransaction> {
    const state = randomValue();
    const nonce = randomValue();
    const codeVerifier = randomValue();
    const binding = randomValue();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    const payload: OidcTransactionPayload = {
      state,
      nonce,
      codeVerifier,
      redirectUri,
      platform,
    };
    await this.repository.create({
      id: randomUUID(),
      stateHash: sha256(state),
      bindingHash: sha256(binding),
      nonceHash: sha256(nonce),
      ciphertext: this.encrypt(payload),
      redirectUri,
      platform,
      expiresAt,
    });
    return {
      ...payload,
      binding,
      codeChallenge: pkceChallenge(codeVerifier),
      expiresAt,
    };
  }

  async consume(
    state: string,
    binding: string,
    now = new Date(),
  ): Promise<OidcTransactionPayload> {
    const record = await this.repository.consume(
      sha256(state),
      sha256(binding),
      now,
    );
    if (record === undefined) throw new InvalidOidcTransactionError();
    const payload = this.decrypt(record.ciphertext);
    if (
      payload.state !== state ||
      sha256(payload.nonce) !== record.nonceHash ||
      payload.redirectUri !== record.redirectUri ||
      payload.platform !== record.platform
    ) {
      throw new InvalidOidcTransactionError();
    }
    return payload;
  }

  private encrypt(payload: OidcTransactionPayload): Uint8Array {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, initializationVector);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([
      initializationVector,
      cipher.getAuthTag(),
      ciphertext,
    ]);
  }

  private decrypt(value: Uint8Array): OidcTransactionPayload {
    try {
      const buffer = Buffer.from(value);
      const initializationVector = buffer.subarray(0, 12);
      const authenticationTag = buffer.subarray(12, 28);
      const ciphertext = buffer.subarray(28);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        initializationVector,
      );
      decipher.setAuthTag(authenticationTag);
      return JSON.parse(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
          'utf8',
        ),
      ) as OidcTransactionPayload;
    } catch {
      throw new InvalidOidcTransactionError();
    }
  }
}
