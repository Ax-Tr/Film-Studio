export type SyncState =
  | 'local-only'
  | 'queued'
  | 'sending'
  | 'synced'
  | 'conflicted'
  | 'blocked';

export interface OperationEnvelope<TPayload = unknown> {
  readonly operationId: string;
  readonly deviceId: string;
  readonly deviceSequence: number;
  readonly filmId: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

export interface SyncCursor {
  readonly filmId: string;
  readonly revision: number;
  readonly expiresAt: string;
}

export function nextSyncState(
  current: SyncState,
  event: 'edit' | 'send' | 'ack' | 'conflict' | 'deny' | 'retry',
): SyncState {
  const transitions: Record<SyncState, Partial<Record<typeof event, SyncState>>> = {
    'local-only': { edit: 'queued', send: 'sending', deny: 'blocked' },
    queued: { edit: 'queued', send: 'sending', deny: 'blocked' },
    sending: { ack: 'synced', conflict: 'conflicted', deny: 'blocked', retry: 'queued' },
    synced: { edit: 'queued', deny: 'blocked' },
    conflicted: { edit: 'queued', deny: 'blocked', retry: 'queued' },
    blocked: {},
  };
  return transitions[current][event] ?? current;
}
