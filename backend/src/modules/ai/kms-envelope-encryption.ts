import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Default master KMS envelope key (32 bytes = 256 bits)
const DEFAULT_KMS_MASTER_KEY = Buffer.from(
  '4a89fb31c7e923d5a1b06f8c7e2d4a1b9e0f3c5a7b2d4e6f8a0b2c4d6e8f0a2b',
  'hex'
);

export interface EncryptedSecretPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  kmsKeyVersion: string;
}

export class KmsEnvelopeEncryption {
  private readonly masterKey: Buffer;

  constructor(masterKey?: Buffer) {
    this.masterKey = masterKey ?? (
      process.env.AI_GATEWAY_MASTER_KMS_KEY
        ? Buffer.from(process.env.AI_GATEWAY_MASTER_KMS_KEY, 'hex')
        : DEFAULT_KMS_MASTER_KEY
    );
  }

  encryptSecret(plainText: string): EncryptedSecretPayload {
    const iv = randomBytes(12); // Standard 96-bit IV for AES-GCM
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv,
      tag,
      kmsKeyVersion: 'v1',
    };
  }

  decryptSecret(ciphertext: Buffer, iv: Buffer, tag: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  static maskApiKey(key: string): string {
    if (!key || key.length < 8) return '********';
    const prefix = key.slice(0, 4);
    const suffix = key.slice(-4);
    return `${prefix}...${suffix}`;
  }

  static hashRequest(payload: unknown): string {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return createHash('sha256').update(json).digest('hex');
  }
}
