import type {
  ClientOperation,
  ConflictRecord,
  SyncPullResponse,
  SyncPushResult,
} from '@film-studio/sync-core';

export interface SyncRepository {
  pushOperations(
    userId: string,
    filmId: string,
    operations: readonly ClientOperation[],
  ): Promise<{
    results: SyncPushResult[];
    latestServerRevision: number;
  }>;

  pullOperations(
    userId: string,
    filmId: string,
    cursorRevision: number,
    limit: number,
  ): Promise<SyncPullResponse>;

  acknowledgeRevision(
    userId: string,
    filmId: string,
    deviceId: string,
    serverRevision: number,
  ): Promise<void>;

  listConflicts(
    userId: string,
    filmId: string,
  ): Promise<ConflictRecord[]>;

  resolveConflict(
    userId: string,
    filmId: string,
    conflictId: string,
    resolution: {
      choice: 'keep_local' | 'keep_remote' | 'merge' | 'save_alternative';
      mergedPayload?: Record<string, unknown>;
    },
  ): Promise<ConflictRecord>;

  setCompactionFloor(
    userId: string,
    filmId: string,
    floorRevision: number,
  ): Promise<number>;
}
