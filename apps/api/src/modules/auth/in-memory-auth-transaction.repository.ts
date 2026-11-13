import type {
  AuthTransactionRecord,
  AuthTransactionRepository,
} from './oidc-transaction.types.js';

export class InMemoryAuthTransactionRepository
  implements AuthTransactionRepository
{
  private readonly records = new Map<string, AuthTransactionRecord>();

  async create(record: AuthTransactionRecord): Promise<void> {
    this.records.set(record.stateHash, record);
  }

  async consume(
    stateHash: string,
    bindingHash: string,
    now: Date,
  ): Promise<AuthTransactionRecord | undefined> {
    const record = this.records.get(stateHash);
    if (
      record === undefined ||
      record.bindingHash !== bindingHash ||
      record.consumedAt !== undefined ||
      record.expiresAt <= now
    ) {
      return undefined;
    }
    const consumed = { ...record, consumedAt: now };
    this.records.set(stateHash, consumed);
    return consumed;
  }
}
