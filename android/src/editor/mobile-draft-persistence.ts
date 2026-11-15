import type { MobileLocalRepository } from '../database/mobile-repository';
import type { MobileScreenplayBlock } from './mobile-screenplay-editor-engine';

export interface MobileDraftRecoveryPayload {
  readonly sceneId: string;
  readonly filmId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly blocks: readonly MobileScreenplayBlock[];
  readonly timestamp: number;
}

export class MobileDraftPersistenceManager {
  private static readonly memoryDrafts = new Map<string, MobileDraftRecoveryPayload>();

  constructor(
    private readonly filmId: string,
    private readonly documentId: string,
    private readonly repo: MobileLocalRepository
  ) {}

  /**
   * Persists an in-flight uncommitted draft instantaneously to local storage
   * guaranteeing zero data loss across process termination or backgrounding.
   */
  async persistDraft(sceneId: string, blocks: readonly MobileScreenplayBlock[], revision: number): Promise<void> {
    const payload: MobileDraftRecoveryPayload = {
      sceneId,
      filmId: this.filmId,
      documentId: this.documentId,
      revision,
      blocks,
      timestamp: Date.now(),
    };

    // Keep hot in-memory / state backup
    MobileDraftPersistenceManager.memoryDrafts.set(sceneId, payload);

    // Persist into canonical SQLite mobile_blocks table atomically
    await this.repo.upsertBlocks(
      sceneId,
      blocks.map((b) => ({
        id: b.id,
        sortOrder: b.sortOrder,
        type: b.type,
        text: b.text,
      }))
    );
  }

  /**
   * Commits current draft into both local SQLite and enqueues a mutation
   * into `mobile_outbox` for background sync with monotonic device sequence.
   */
  async commitDraftToOutbox(
    sceneId: string,
    blocks: readonly MobileScreenplayBlock[],
    deviceSeq: number
  ): Promise<string> {
    const outboxId = `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. Persist local blocks
    await this.persistDraft(sceneId, blocks, deviceSeq);

    // 2. Enqueue mutation
    await this.repo.enqueueOutbox({
      id: outboxId,
      filmId: this.filmId,
      entityType: 'scene_blocks',
      entityId: sceneId,
      operationType: 'update',
      payload: {
        documentId: this.documentId,
        sceneId,
        blocks: blocks.map((b) => ({
          id: b.id,
          type: b.type,
          text: b.text,
          sortOrder: b.sortOrder,
        })),
      },
      deviceSeq,
    });

    return outboxId;
  }

  /**
   * Recovers uncommitted draft from SQLite after process kill or crash
   */
  async recoverDraft(sceneId: string): Promise<MobileScreenplayBlock[] | null> {
    const records = await this.repo.listBlocks(sceneId);
    if (records.length === 0) {
      const mem = MobileDraftPersistenceManager.memoryDrafts.get(sceneId);
      return mem ? [...mem.blocks] : null;
    }

    return records.map((r) => ({
      id: r.id,
      sceneId: r.scene_id,
      type: r.type as MobileScreenplayBlock['type'],
      text: r.text,
      sortOrder: r.sort_order,
    }));
  }
}

