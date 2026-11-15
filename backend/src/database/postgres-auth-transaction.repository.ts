import type { Pool } from 'pg';
import type {
  AuthPlatform,
  AuthTransactionRecord,
  AuthTransactionRepository,
} from '../modules/auth/oidc-transaction.types.js';

interface AuthTransactionRow {
  id: string;
  state_hash: string;
  browser_binding_hash: string;
  nonce_hash: string;
  code_verifier_ciphertext: Uint8Array;
  redirect_uri: string;
  platform: AuthPlatform;
  expires_at: Date;
  consumed_at: Date | null;
}

function mapRecord(row: AuthTransactionRow): AuthTransactionRecord {
  return {
    id: row.id,
    stateHash: row.state_hash,
    bindingHash: row.browser_binding_hash,
    nonceHash: row.nonce_hash,
    ciphertext: row.code_verifier_ciphertext,
    redirectUri: row.redirect_uri,
    platform: row.platform,
    expiresAt: row.expires_at,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
  };
}

export class PostgresAuthTransactionRepository
  implements AuthTransactionRepository
{
  constructor(private readonly pool: Pool) {}

  async create(record: AuthTransactionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_transactions (
        id, state_hash, browser_binding_hash, nonce_hash,
        code_verifier_ciphertext, redirect_uri, platform, expires_at
      ) VALUES (
        $1, decode($2, 'hex'), decode($3, 'hex'), decode($4, 'hex'),
        $5, $6, $7, $8
      )`,
      [
        record.id,
        record.stateHash,
        record.bindingHash,
        record.nonceHash,
        record.ciphertext,
        record.redirectUri,
        record.platform,
        record.expiresAt,
      ],
    );
  }

  async consume(
    stateHash: string,
    bindingHash: string,
    now: Date,
  ): Promise<AuthTransactionRecord | undefined> {
    const result = await this.pool.query<AuthTransactionRow>(
      `UPDATE auth_transactions SET consumed_at = $3
       WHERE state_hash = decode($1, 'hex')
         AND browser_binding_hash = decode($2, 'hex')
         AND consumed_at IS NULL
         AND expires_at > $3
       RETURNING id, encode(state_hash, 'hex') AS state_hash,
         encode(browser_binding_hash, 'hex') AS browser_binding_hash,
         encode(nonce_hash, 'hex') AS nonce_hash,
         code_verifier_ciphertext, redirect_uri, platform, expires_at, consumed_at`,
      [stateHash, bindingHash, now],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRecord(row);
  }
}
