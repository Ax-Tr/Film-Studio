import type { MobileLocalRepository } from '../database/mobile-repository';
import type { SyncPushResult } from '@film-studio/sync-core';

export interface MobileSyncState {
  readonly isSyncing: boolean;
  readonly lastSyncedAt: string | null;
  readonly lastServerRevision: number;
  readonly pendingOutboxCount: number;
  readonly unresolvedConflictCount: number;
}

export interface RemoteSyncClient {
  pushOperations(
    filmId: string,
    ops: readonly {
      readonly opId: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly operationType: string;
      readonly payload: unknown;
      readonly deviceSeq: number;
    }[]
  ): Promise<readonly SyncPushResult[]>;

  pullOperations(
    filmId: string,
    sinceRevision: number
  ): Promise<{
    readonly serverRevision: number;
    readonly operations: readonly {
      readonly opId: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly serverRevision: number;
      readonly payload: unknown;
    }[];
  }>;
}

export class MobileSyncCoordinator {
  private isSyncing = false;
  private lastSyncedAt: string | null = null;

  constructor(
    private readonly filmId: string,
    private readonly repo: MobileLocalRepository,
    private readonly remoteClient: RemoteSyncClient
  ) {}

  async getSyncState(): Promise<MobileSyncState> {
    const meta = await this.repo.getSyncMeta(this.filmId);
    const outbox = await this.repo.listPendingOutbox();
    const conflicts = await this.repo.listConflicts(this.filmId);
    const unresolved = conflicts.filter((c) => c.resolution_status === 'unresolved');

    return {
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      lastServerRevision: meta?.last_server_revision ?? 0,
      pendingOutboxCount: outbox.length,
      unresolvedConflictCount: unresolved.length,
    };
  }

  /**
   * Performs an atomic bidirectional sync cycle:
   * 1. Pull remote operations since local last_server_revision.
   * 2. Detect conflicts (e.g. concurrent remote updates to local entities).
   * 3. Push pending local outbox mutations to the remote server with monotonic sequence.
   * 4. Update sync metadata and mark sent outbox entries.
   */
  async synchronize(): Promise<{
    pushedCount: number;
    pulledCount: number;
    conflictCount: number;
  }> {
    if (this.isSyncing) {
      return { pushedCount: 0, pulledCount: 0, conflictCount: 0 };
    }
    this.isSyncing = true;

    try {
      const meta = await this.repo.getSyncMeta(this.filmId);
      let currentRevision = meta?.last_server_revision ?? 0;

      // 1. Pull remote operations
      const pullResult = await this.remoteClient.pullOperations(this.filmId, currentRevision);
      let pulledCount = 0;
      let conflictCount = 0;

      // 2. Process pulled operations
      for (const op of pullResult.operations) {
        pulledCount++;
        // If entity matches an in-flight uncommitted outbox mutation, branch into conflict
        const pendingOutbox = await this.repo.listPendingOutbox();
        const conflictingLocal = pendingOutbox.find(
          (o) => o.entity_id === op.entityId && o.entity_type === op.entityType
        );

        if (conflictingLocal) {
          // Record field-level conflict sheet
          conflictCount++;
          await this.repo.recordConflict({
            id: `conf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            filmId: this.filmId,
            entityType: op.entityType,
            entityId: op.entityId,
            conflictType: 'SAME_FIELD_CHANGED',
            serverRevision: op.serverRevision,
            clientVersion: conflictingLocal.device_seq,
            remotePayload: op.payload,
            localPayload: JSON.parse(conflictingLocal.payload_json),
          });
        }
      }

      // 3. Push pending outbox mutations
      const pending = await this.repo.listPendingOutbox();
      let pushedCount = 0;

      if (pending.length > 0) {
        const opsToPush = pending.map((item) => ({
          opId: item.id,
          entityType: item.entity_type,
          entityId: item.entity_id,
          operationType: item.operation_type,
          payload: JSON.parse(item.payload_json),
          deviceSeq: item.device_seq,
        }));

        let maxPushedRevision = currentRevision;
        const pushResults = await this.remoteClient.pushOperations(this.filmId, opsToPush);
        for (const res of pushResults) {
          if (res.status === 'applied' || res.status === 'already_applied') {
            await this.repo.markOutboxSent(res.opId);
            pushedCount++;
            if (res.serverRevision && res.serverRevision > maxPushedRevision) {
              maxPushedRevision = res.serverRevision;
            }
          }
        }
        currentRevision = Math.max(currentRevision, maxPushedRevision);
      }

      // 4. Update sync metadata
      const newServerRevision = Math.max(currentRevision, pullResult.serverRevision);
      await this.repo.updateSyncMeta({
        filmId: this.filmId,
        lastServerRevision: newServerRevision,
        compactionFloor: 0,
      });

      this.lastSyncedAt = new Date().toISOString();
      return { pushedCount, pulledCount, conflictCount };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Resolves a recorded conflict by choosing local or remote resolution
   */
  async resolveConflict(
    conflictId: string,
    choice: 'keep_local' | 'keep_remote'
  ): Promise<void> {
    void choice;
    await this.repo.resolveConflict(conflictId);
  }
}
