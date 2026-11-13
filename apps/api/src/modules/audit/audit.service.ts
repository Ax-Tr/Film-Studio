import { createHash, randomUUID } from 'node:crypto';
import {
  auditEventEnvelopeSchema,
  type AuditEventEnvelope,
} from '@film-studio/contracts';

export interface AuditRepository {
  insert(event: AuditEventEnvelope, sourceIpHash?: Uint8Array, userAgentHash?: Uint8Array): Promise<void>;
}

export interface RecordAuditEvent
  extends Omit<AuditEventEnvelope, 'id' | 'occurredAt' | 'metadata'> {
  readonly occurredAt?: Date;
  readonly sourceIp?: string;
  readonly userAgent?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

const forbiddenMetadataKey = /(content|dialogue|email|key|name|prompt|script|secret|token)/iu;

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(input: RecordAuditEvent): Promise<AuditEventEnvelope> {
    const metadata = input.metadata ?? {};
    for (const key of Object.keys(metadata)) {
      if (forbiddenMetadataKey.test(key)) {
        throw new Error(`Audit metadata key is not allowed: ${key}`);
      }
    }
    const event = auditEventEnvelopeSchema.parse({
      ...input,
      id: randomUUID(),
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      metadata,
    });
    await this.repository.insert(
      event,
      input.sourceIp === undefined ? undefined : this.hash(input.sourceIp),
      input.userAgent === undefined ? undefined : this.hash(input.userAgent),
    );
    return event;
  }

  private hash(value: string): Uint8Array {
    return createHash('sha256').update(value, 'utf8').digest();
  }
}
