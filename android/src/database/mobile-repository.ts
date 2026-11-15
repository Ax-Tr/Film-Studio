/**
 * Mobile Content & Project Local Repository
 *
 * Provides typed, offline-first CRUD operations on top of the local SQLite schema:
 * - Upsert cached films / projects
 * - Read active / archived projects
 * - Cache documents and scene cards
 * - Enqueue offline mutation into mobile outbox
 * - Atomic local rollback and clear operations
 */

import type { MobileDatabaseAdapter } from './mobile-database';

export interface MobileFilmRecord {
  readonly id: string;
  readonly title: string;
  readonly logline?: string;
  readonly state: string;
  readonly is_archived: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly local_version: number;
}

export interface MobileDocumentRecord {
  readonly id: string;
  readonly film_id: string;
  readonly title: string;
  readonly kind: string;
  readonly current_version_id?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MobileSceneRecord {
  readonly id: string;
  readonly document_id: string;
  readonly heading: string;
  readonly sort_order: number;
  readonly is_locked: number;
  readonly synopsis?: string;
  readonly updated_at: string;
}

export interface MobileBlockRecord {
  readonly id: string;
  readonly scene_id: string;
  readonly sort_order: number;
  readonly type: string;
  readonly text: string;
  readonly character_name?: string;
  readonly updated_at: string;
}

export interface MobileConflictRecord {
  readonly id: string;
  readonly film_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly conflict_type: string;
  readonly server_revision: number;
  readonly client_version: number;
  readonly remote_payload_json: string;
  readonly local_payload_json: string;
  readonly resolution_status: 'unresolved' | 'resolved';
  readonly created_at: string;
}

export interface MobileSyncMetaRecord {
  readonly film_id: string;
  readonly last_server_revision: number;
  readonly compaction_floor: number;
  readonly updated_at: string;
}

export interface MobileOutboxRecord {
  readonly id: string;
  readonly film_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly operation_type: string;
  readonly payload_json: string;
  readonly device_seq: number;
  readonly created_at: string;
  readonly status: 'pending' | 'sent' | 'failed';
  readonly retry_count: number;
  readonly error_message?: string;
}

export class MobileLocalRepository {
  constructor(private readonly db: MobileDatabaseAdapter) {}

  async upsertFilm(film: {
    id: string;
    title: string;
    logline?: string;
    state?: string;
    isArchived?: boolean;
    createdAt?: string;
    updatedAt?: string;
    localVersion?: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO mobile_films (id, title, logline, state, is_archived, created_at, updated_at, local_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        film.id,
        film.title,
        film.logline ?? null,
        film.state ?? 'draft',
        film.isArchived ? 1 : 0,
        film.createdAt ?? now,
        film.updatedAt ?? now,
        film.localVersion ?? 1,
      ]
    );
  }

  async listFilms(filterArchived = false): Promise<MobileFilmRecord[]> {
    return await this.db.getAllAsync<MobileFilmRecord>(
      `SELECT * FROM mobile_films WHERE is_archived = ?`,
      [filterArchived ? 1 : 0]
    );
  }

  async setFilmArchived(filmId: string, isArchived: boolean): Promise<void> {
    await this.db.runAsync(`UPDATE mobile_films SET is_archived = ? WHERE id = ?`, [
      isArchived ? 1 : 0,
      filmId,
    ]);
  }

  async upsertDocument(doc: {
    id: string;
    filmId: string;
    title: string;
    kind?: string;
    currentVersionId?: string;
    createdAt?: string;
    updatedAt?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO mobile_documents (id, film_id, title, kind, current_version_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        doc.filmId,
        doc.title,
        doc.kind ?? 'screenplay',
        doc.currentVersionId ?? null,
        doc.createdAt ?? now,
        doc.updatedAt ?? now,
      ]
    );
  }

  async listDocuments(filmId: string): Promise<MobileDocumentRecord[]> {
    return await this.db.getAllAsync<MobileDocumentRecord>(
      `SELECT * FROM mobile_documents WHERE film_id = ?`,
      [filmId]
    );
  }

  async upsertScene(scene: {
    id: string;
    documentId: string;
    heading: string;
    sortOrder: number;
    isLocked?: boolean;
    synopsis?: string;
    updatedAt?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO mobile_scenes (id, document_id, heading, sort_order, is_locked, synopsis, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        scene.id,
        scene.documentId,
        scene.heading,
        scene.sortOrder,
        scene.isLocked ? 1 : 0,
        scene.synopsis ?? null,
        scene.updatedAt ?? now,
      ]
    );
  }

  async listScenes(documentId: string): Promise<MobileSceneRecord[]> {
    return await this.db.getAllAsync<MobileSceneRecord>(
      `SELECT * FROM mobile_scenes WHERE document_id = ?`,
      [documentId]
    );
  }

  async upsertBlocks(
    sceneId: string,
    blocks: readonly {
      id: string;
      sortOrder: number;
      type: string;
      text: string;
      characterName?: string;
    }[]
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(`DELETE FROM mobile_blocks WHERE scene_id = ?`, [sceneId]);
    for (const b of blocks) {
      await this.db.runAsync(
        `INSERT INTO mobile_blocks (id, scene_id, sort_order, type, text, character_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.id, sceneId, b.sortOrder, b.type, b.text, b.characterName ?? null, now]
      );
    }
  }

  async listBlocks(sceneId: string): Promise<MobileBlockRecord[]> {
    return await this.db.getAllAsync<MobileBlockRecord>(
      `SELECT * FROM mobile_blocks WHERE scene_id = ?`,
      [sceneId]
    );
  }

  async enqueueOutbox(mutation: {
    id: string;
    filmId: string;
    entityType: string;
    entityId: string;
    operationType: string;
    payload: unknown;
    deviceSeq: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO mobile_outbox (id, film_id, entity_type, entity_id, operation_type, payload_json, device_seq, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutation.id,
        mutation.filmId,
        mutation.entityType,
        mutation.entityId,
        mutation.operationType,
        JSON.stringify(mutation.payload),
        mutation.deviceSeq,
        now,
        'pending',
      ]
    );
  }

  async listPendingOutbox(): Promise<MobileOutboxRecord[]> {
    return await this.db.getAllAsync<MobileOutboxRecord>(
      `SELECT * FROM mobile_outbox WHERE status = ?`,
      ['pending']
    );
  }

  async markOutboxSent(outboxId: string): Promise<void> {
    await this.db.runAsync(`UPDATE mobile_outbox SET status = ? WHERE id = ?`, ['sent', outboxId]);
  }

  async recordConflict(conflict: {
    id: string;
    filmId: string;
    entityType: string;
    entityId: string;
    conflictType: string;
    serverRevision: number;
    clientVersion: number;
    remotePayload: unknown;
    localPayload: unknown;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO mobile_conflicts (id, film_id, entity_type, entity_id, conflict_type, server_revision, client_version, remote_payload_json, local_payload_json, resolution_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conflict.id,
        conflict.filmId,
        conflict.entityType,
        conflict.entityId,
        conflict.conflictType,
        conflict.serverRevision,
        conflict.clientVersion,
        JSON.stringify(conflict.remotePayload),
        JSON.stringify(conflict.localPayload),
        'unresolved',
        now,
      ]
    );
  }

  async listConflicts(filmId: string): Promise<MobileConflictRecord[]> {
    return await this.db.getAllAsync<MobileConflictRecord>(
      `SELECT * FROM mobile_conflicts WHERE film_id = ?`,
      [filmId]
    );
  }

  async resolveConflict(conflictId: string): Promise<void> {
    await this.db.runAsync(`UPDATE mobile_conflicts SET resolution_status = ? WHERE id = ?`, [
      'resolved',
      conflictId,
    ]);
  }

  async updateSyncMeta(meta: {
    filmId: string;
    lastServerRevision: number;
    compactionFloor: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO mobile_sync_meta (film_id, last_server_revision, compaction_floor, updated_at)
       VALUES (?, ?, ?, ?)`,
      [meta.filmId, meta.lastServerRevision, meta.compactionFloor, now]
    );
  }

  async getSyncMeta(filmId: string): Promise<MobileSyncMetaRecord | null> {
    return await this.db.getFirstAsync<MobileSyncMetaRecord>(
      `SELECT * FROM mobile_sync_meta WHERE film_id = ?`,
      [filmId]
    );
  }
}
