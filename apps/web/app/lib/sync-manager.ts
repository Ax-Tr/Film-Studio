import type {
  ClientOperationDto,
  PushSyncOperationsResponse,
  PullSyncOperationsResponse,
  SyncConflictDto,
} from '@film-studio/contracts';

export type SyncStatusState = 'idle' | 'syncing' | 'conflict' | 'offline';

export interface SyncStatus {
  readonly state: SyncStatusState;
  readonly pendingCount: number;
  readonly conflictCount: number;
  readonly lastAckRevision: number;
  readonly lastSyncTimestamp: number | null;
}

export class WebSyncManager {
  private pendingQueue: ClientOperationDto[] = [];
  private lastAckRevision = 0;
  private currentCursor: string | null = null;
  private lastSyncTimestamp: number | null = null;
  private conflicts: SyncConflictDto[] = [];
  private isSyncing = false;

  private storageKeyPrefix: string;

  constructor(
    private readonly filmId: string,
    private readonly deviceId: string,
    private readonly apiBase = '',
  ) {
    this.storageKeyPrefix = `film-studio.sync.${this.filmId}.`;
    this.loadFromStorage();
  }

  enqueue(
    op: Omit<ClientOperationDto, 'clientSequence' | 'createdAtClient'>,
  ): ClientOperationDto {
    const nextSeq = this.getNextSequence();
    const fullOp: ClientOperationDto = {
      ...op,
      clientSequence: nextSeq,
      createdAtClient: new Date().toISOString(),
    };
    this.pendingQueue.push(fullOp);
    this.saveToStorage();
    return fullOp;
  }

  getPending(): readonly ClientOperationDto[] {
    return this.pendingQueue;
  }

  getConflicts(): readonly SyncConflictDto[] {
    return this.conflicts;
  }

  getStatus(isOffline: boolean): SyncStatus {
    let state: SyncStatusState = 'idle';
    if (isOffline) {
      state = 'offline';
    } else if (this.isSyncing) {
      state = 'syncing';
    } else if (this.conflicts.length > 0) {
      state = 'conflict';
    }

    return {
      state,
      pendingCount: this.pendingQueue.length,
      conflictCount: this.conflicts.length,
      lastAckRevision: this.lastAckRevision,
      lastSyncTimestamp: this.lastSyncTimestamp,
    };
  }

  async sync(): Promise<{ pushed: number; pulled: number; conflicts: number }> {
    if (this.isSyncing) return { pushed: 0, pulled: 0, conflicts: this.conflicts.length };
    this.isSyncing = true;

    let pushed = 0;
    let pulled = 0;

    try {
      // 1. Push pending operations if any
      if (this.pendingQueue.length > 0) {
        const batch = [...this.pendingQueue];
        const res = await fetch(`${this.apiBase}/v1/sync/push`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            filmId: this.filmId,
            deviceId: this.deviceId,
            operations: batch,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as PushSyncOperationsResponse;
          // Identify successfully applied operations
          const appliedOpIds = new Set(
            data.results
              .filter((r) => r.status === 'applied' || r.status === 'already_applied')
              .map((r) => r.opId),
          );
          this.pendingQueue = this.pendingQueue.filter((op) => !appliedOpIds.has(op.opId));
          pushed = appliedOpIds.size;

          if (data.latestServerRevision > this.lastAckRevision) {
            this.lastAckRevision = data.latestServerRevision;
          }
        }
      }

      // 2. Pull new operations from server
      const params = new URLSearchParams({ filmId: this.filmId });
      if (this.currentCursor) params.set('cursor', this.currentCursor);

      const pullRes = await fetch(`${this.apiBase}/v1/sync/pull?${params.toString()}`, {
        headers: { accept: 'application/json' },
      });

      if (pullRes.ok) {
        const pullData = (await pullRes.json()) as PullSyncOperationsResponse;
        pulled = pullData.operations.length;
        this.currentCursor = pullData.nextCursor;

        if (pullData.latestServerRevision > this.lastAckRevision) {
          this.lastAckRevision = pullData.latestServerRevision;
          // Send acknowledgement
          await fetch(`${this.apiBase}/v1/sync/ack`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              filmId: this.filmId,
              deviceId: this.deviceId,
              acknowledgedRevision: this.lastAckRevision,
            }),
          });
        }
      }

      // 3. Refresh conflicts list
      const conflictsRes = await fetch(`${this.apiBase}/v1/films/${this.filmId}/conflicts`, {
        headers: { accept: 'application/json' },
      });
      if (conflictsRes.ok) {
        this.conflicts = (await conflictsRes.json()) as SyncConflictDto[];
      }

      this.lastSyncTimestamp = Date.now();
      this.saveToStorage();
    } finally {
      this.isSyncing = false;
    }

    return { pushed, pulled, conflicts: this.conflicts.length };
  }

  async resolveConflict(
    conflictId: string,
    choice: 'keep_local' | 'keep_remote' | 'merge' | 'save_alternative',
    mergedPayload?: Record<string, unknown>,
  ): Promise<SyncConflictDto> {
    const res = await fetch(
      `${this.apiBase}/v1/films/${this.filmId}/conflicts/${conflictId}/resolve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          choice,
          ...(mergedPayload ? { mergedPayload } : {}),
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to resolve conflict: ${res.status}`);
    }

    const resolved = (await res.json()) as SyncConflictDto;
    this.conflicts = this.conflicts.filter((c) => c.id !== conflictId);
    this.saveToStorage();
    return resolved;
  }

  private getNextSequence(): number {
    let max = 0;
    for (const op of this.pendingQueue) {
      if (op.clientSequence > max) max = op.clientSequence;
    }
    return max + 1;
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const q = localStorage.getItem(this.storageKeyPrefix + 'queue');
      if (q) this.pendingQueue = JSON.parse(q) as ClientOperationDto[];
      const ack = localStorage.getItem(this.storageKeyPrefix + 'ack');
      if (ack) this.lastAckRevision = Number(ack);
      const cur = localStorage.getItem(this.storageKeyPrefix + 'cursor');
      if (cur) this.currentCursor = cur;
    } catch {
      // Ignored
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKeyPrefix + 'queue', JSON.stringify(this.pendingQueue));
      localStorage.setItem(this.storageKeyPrefix + 'ack', String(this.lastAckRevision));
      if (this.currentCursor) {
        localStorage.setItem(this.storageKeyPrefix + 'cursor', this.currentCursor);
      }
    } catch {
      // Ignored
    }
  }
}
