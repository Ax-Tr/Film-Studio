export type SyncState =
  | 'local-only'
  | 'queued'
  | 'sending'
  | 'synced'
  | 'conflicted'
  | 'blocked';

export interface ClientOperation<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly schemaVersion: 1;
  readonly opId: string;
  readonly filmId: string;
  readonly actorUserId: string;
  readonly deviceId: string;
  readonly clientSequence: number;
  readonly entityType: string;
  readonly entityId: string;
  readonly kind: string;
  readonly baseVersion: number | null;
  readonly payload: TPayload;
  readonly createdAtClient: string;
}

export interface AcceptedOperation<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> extends ClientOperation<TPayload> {
  readonly serverRevision: number;
  readonly recordedAt: string;
}

export type SyncPushStatus =
  | 'applied'
  | 'already_applied'
  | 'conflict'
  | 'rejected';

export interface SyncPushResult {
  readonly opId: string;
  readonly status: SyncPushStatus;
  readonly serverRevision?: number;
  readonly entityVersion?: number;
  readonly conflictId?: string;
  readonly errorCode?: string;
}

export type ConflictType =
  | 'SAME_FIELD_CHANGED'
  | 'DELETE_VS_EDIT'
  | 'FUTURE_BASE_VERSION'
  | 'CONCURRENT_CONFLICT';

export interface ConflictRecord {
  readonly id: string;
  readonly filmId: string;
  readonly operationId: string;
  readonly actorUserId: string;
  readonly deviceId: string;
  readonly conflictType: ConflictType;
  readonly entityType: string;
  readonly entityId: string;
  readonly baseVersion: number | null;
  readonly serverVersion: number;
  readonly clientPayload: Record<string, unknown>;
  readonly serverPayload: Record<string, unknown>;
  readonly recoveryBranchId?: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly resolutionStrategy?:
    | 'keep_local'
    | 'keep_remote'
    | 'merge'
    | 'save_alternative';
  readonly createdAt: string;
}

export interface SyncPullResponse {
  readonly kind: 'operations' | 'snapshot_required';
  readonly operations: readonly AcceptedOperation[];
  readonly nextCursor: string;
  readonly hasMore: boolean;
  readonly latestServerRevision: number;
  readonly floorRevision?: number;
}

export interface SyncCursorPayload {
  readonly filmId: string;
  readonly revision: number;
  readonly issuedAt: string;
}

export function nextSyncState(
  current: SyncState,
  event: 'edit' | 'send' | 'ack' | 'conflict' | 'deny' | 'retry',
): SyncState {
  const transitions: Record<SyncState, Partial<Record<typeof event, SyncState>>> = {
    'local-only': { edit: 'queued', send: 'sending', deny: 'blocked' },
    queued: { edit: 'queued', send: 'sending', deny: 'blocked' },
    sending: {
      ack: 'synced',
      conflict: 'conflicted',
      deny: 'blocked',
      retry: 'queued',
    },
    synced: { edit: 'queued', deny: 'blocked' },
    conflicted: { edit: 'queued', deny: 'blocked', retry: 'queued' },
    blocked: {},
  };
  return transitions[current][event] ?? current;
}

export function evaluateFieldConflict(options: {
  readonly baseVersion: number | null;
  readonly currentVersion: number;
  readonly fieldVersions: Record<string, number>;
  readonly currentFields: Record<string, unknown>;
  readonly patchPayload: Record<string, unknown>;
}): { readonly hasConflict: boolean; readonly conflictingFields: readonly string[] } {
  const { baseVersion, fieldVersions, currentFields, patchPayload } = options;
  const base = baseVersion ?? 0;
  const conflictingFields: string[] = [];

  for (const [field, patchValue] of Object.entries(patchPayload)) {
    const lastModifiedAtVersion = fieldVersions[field] ?? 0;
    if (lastModifiedAtVersion > base) {
      const currentValue = currentFields[field];
      if (JSON.stringify(currentValue) !== JSON.stringify(patchValue)) {
        conflictingFields.push(field);
      }
    }
  }

  return {
    hasConflict: conflictingFields.length > 0,
    conflictingFields,
  };
}

export function encodeSyncCursor(cursor: SyncCursorPayload): string {
  const raw = `${cursor.filmId}:${cursor.revision}:${cursor.issuedAt}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeSyncCursor(token: string): SyncCursorPayload | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length < 3) return null;
    const filmId = parts[0];
    const revStr = parts[1];
    if (filmId === undefined || revStr === undefined) return null;
    const revision = Number(revStr);
    if (!Number.isInteger(revision) || revision < 0) return null;
    const issuedAt = parts.slice(2).join(':');
    return { filmId, revision, issuedAt };
  } catch {
    return null;
  }
}

export function calculateSafeCompactionFloor(
  activeDeviceAcks: readonly number[],
  currentRevision: number,
  requestedFloor: number,
): number {
  const safeUpperLimit =
    activeDeviceAcks.length === 0
      ? currentRevision
      : Math.min(...activeDeviceAcks);
  if (requestedFloor > safeUpperLimit) {
    throw new Error('Compaction would strand an active device');
  }
  return Math.min(requestedFloor, currentRevision);
}
