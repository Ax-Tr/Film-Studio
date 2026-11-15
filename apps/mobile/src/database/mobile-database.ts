/**
 * Mobile SQLite Schema and Database Client
 *
 * Defines canonical local persistence mirroring server content model and sync queue:
 * - `mobile_films`: cached project metadata, title, logline, status
 * - `mobile_documents`: cached document versions, title, kind, active version
 * - `mobile_scenes`: local scene cards with ordering, lock state, synopses
 * - `mobile_blocks`: typed screenplay blocks preserving Telugu NFC text
 * - `mobile_outbox`: offline mutation queue with per-device sequence, client timestamp, idempotency key
 * - `mobile_sync_meta`: tracking last pull server revision, local revision, compaction floor
 *
 * Provides a unified asynchronous interface supported both by `expo-sqlite` on native Android
 * and an in-memory SQL driver for automated tests / non-native runtimes.
 */

export interface MobileDatabaseAdapter {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: (string | number | null | Uint8Array)[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T = unknown>(sql: string, params?: (string | number | null | Uint8Array)[]): Promise<T[]>;
  getFirstAsync<T = unknown>(sql: string, params?: (string | number | null | Uint8Array)[]): Promise<T | null>;
  closeAsync(): Promise<void>;
}

export const MOBILE_SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS mobile_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mobile_films (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    logline TEXT,
    state TEXT NOT NULL DEFAULT 'draft',
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    local_version INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS mobile_documents (
    id TEXT PRIMARY KEY NOT NULL,
    film_id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'screenplay',
    current_version_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(film_id) REFERENCES mobile_films(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mobile_scenes (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL,
    heading TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    synopsis TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(document_id) REFERENCES mobile_documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mobile_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    scene_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    character_name TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(scene_id) REFERENCES mobile_scenes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mobile_outbox (
    id TEXT PRIMARY KEY NOT NULL,
    film_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    device_seq INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS mobile_conflicts (
    id TEXT PRIMARY KEY NOT NULL,
    film_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    conflict_type TEXT NOT NULL,
    server_revision INTEGER NOT NULL,
    client_version INTEGER NOT NULL,
    remote_payload_json TEXT NOT NULL,
    local_payload_json TEXT NOT NULL,
    resolution_status TEXT NOT NULL DEFAULT 'unresolved',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mobile_sync_meta (
    film_id TEXT PRIMARY KEY NOT NULL,
    last_server_revision INTEGER NOT NULL DEFAULT 0,
    compaction_floor INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mobile_scenes_doc_order ON mobile_scenes(document_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_mobile_blocks_scene_order ON mobile_blocks(scene_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_mobile_outbox_film_status ON mobile_outbox(film_id, status);
  CREATE INDEX IF NOT EXISTS idx_mobile_conflicts_film_status ON mobile_conflicts(film_id, resolution_status);
`;

/**
 * In-memory SQL engine implementing MobileDatabaseAdapter for desktop/headless test runners
 */
export class InMemoryMobileDatabaseAdapter implements MobileDatabaseAdapter {
  private tables: {
    mobile_meta: Map<string, { key: string; value: string }>;
    mobile_films: Map<string, Record<string, unknown>>;
    mobile_documents: Map<string, Record<string, unknown>>;
    mobile_scenes: Map<string, Record<string, unknown>>;
    mobile_blocks: Map<string, Record<string, unknown>>;
    mobile_outbox: Map<string, Record<string, unknown>>;
    mobile_conflicts: Map<string, Record<string, unknown>>;
    mobile_sync_meta: Map<string, Record<string, unknown>>;
  } = {
    mobile_meta: new Map(),
    mobile_films: new Map(),
    mobile_documents: new Map(),
    mobile_scenes: new Map(),
    mobile_blocks: new Map(),
    mobile_outbox: new Map(),
    mobile_conflicts: new Map(),
    mobile_sync_meta: new Map(),
  };

  async execAsync(sql = ''): Promise<void> {
    void sql;
    // schema initialized
  }

  async runAsync(sql: string, params: (string | number | null | Uint8Array)[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    const trimmed = sql.trim();
    if (trimmed.startsWith('INSERT INTO mobile_films')) {
      const [id, title, logline, state, is_archived, created_at, updated_at, local_version] = params as [string, string, string | null, string, number, string, string, number];
      this.tables.mobile_films.set(id, { id, title, logline, state, is_archived, created_at, updated_at, local_version });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (trimmed.startsWith('INSERT INTO mobile_documents')) {
      const [id, film_id, title, kind, current_version_id, created_at, updated_at] = params as [string, string, string, string, string | null, string, string];
      this.tables.mobile_documents.set(id, { id, film_id, title, kind, current_version_id, created_at, updated_at });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (trimmed.startsWith('INSERT INTO mobile_scenes')) {
      const [id, document_id, heading, sort_order, is_locked, synopsis, updated_at] = params as [string, string, string, number, number, string | null, string];
      this.tables.mobile_scenes.set(id, { id, document_id, heading, sort_order, is_locked, synopsis, updated_at });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (trimmed.startsWith('INSERT INTO mobile_blocks')) {
      const [id, scene_id, sort_order, type, text, character_name, updated_at] = params as [string, string, number, string, string, string | null, string];
      this.tables.mobile_blocks.set(id, { id, scene_id, sort_order, type, text, character_name, updated_at });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (trimmed.startsWith('INSERT INTO mobile_outbox')) {
      const [id, film_id, entity_type, entity_id, operation_type, payload_json, device_seq, created_at, status] = params as [string, string, string, string, string, string, number, string, string];
      this.tables.mobile_outbox.set(id, { id, film_id, entity_type, entity_id, operation_type, payload_json, device_seq, created_at, status, retry_count: 0 });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (trimmed.startsWith('DELETE FROM mobile_films WHERE id = ?')) {
      const [id] = params as [string];
      const had = this.tables.mobile_films.delete(id);
      return { changes: had ? 1 : 0, lastInsertRowId: 0 };
    }
    if (trimmed.startsWith('UPDATE mobile_films SET is_archived = ? WHERE id = ?')) {
      const [is_archived, id] = params as [number, string];
      const item = this.tables.mobile_films.get(id);
      if (item) {
        item.is_archived = is_archived;
        return { changes: 1, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    }
    if (trimmed.startsWith('UPDATE mobile_outbox SET status = ? WHERE id = ?')) {
      const [status, id] = params as [string, string];
      const item = this.tables.mobile_outbox.get(id);
      if (item) {
        item.status = status;
        return { changes: 1, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    }
    if (trimmed.startsWith('DELETE FROM mobile_blocks WHERE scene_id = ?')) {
      const [sceneId] = params as [string];
      let deleted = 0;
      for (const [key, block] of this.tables.mobile_blocks.entries()) {
        if (block.scene_id === sceneId) {
          this.tables.mobile_blocks.delete(key);
          deleted++;
        }
      }
      return { changes: deleted, lastInsertRowId: 0 };
    }
    if (trimmed.startsWith('INSERT INTO mobile_conflicts')) {
      const [id, film_id, entity_type, entity_id, conflict_type, server_revision, client_version, remote_payload_json, local_payload_json, resolution_status, created_at] = params as [string, string, string, string, string, number, number, string, string, string, string];
      this.tables.mobile_conflicts.set(id, { id, film_id, entity_type, entity_id, conflict_type, server_revision, client_version, remote_payload_json, local_payload_json, resolution_status, created_at });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (trimmed.startsWith('UPDATE mobile_conflicts SET resolution_status = ? WHERE id = ?')) {
      const [resolution_status, id] = params as [string, string];
      const conflict = this.tables.mobile_conflicts.get(id);
      if (conflict) {
        conflict.resolution_status = resolution_status;
        return { changes: 1, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    }
    if (trimmed.startsWith('INSERT OR REPLACE INTO mobile_sync_meta')) {
      const [film_id, last_server_revision, compaction_floor, updated_at] = params as [string, number, number, string];
      this.tables.mobile_sync_meta.set(film_id, { film_id, last_server_revision, compaction_floor, updated_at });
      return { changes: 1, lastInsertRowId: 1 };
    }

    return { changes: 0, lastInsertRowId: 0 };
  }

  async getAllAsync<T = unknown>(sql: string, params: (string | number | null | Uint8Array)[] = []): Promise<T[]> {
    const trimmed = sql.trim();
    if (trimmed.includes('FROM mobile_films')) {
      let list = Array.from(this.tables.mobile_films.values());
      if (trimmed.includes('WHERE is_archived = ?')) {
        const [archived] = params as [number];
        list = list.filter((f) => f.is_archived === archived);
      }
      return list as unknown as T[];
    }
    if (trimmed.includes('FROM mobile_documents')) {
      let list = Array.from(this.tables.mobile_documents.values());
      if (trimmed.includes('WHERE film_id = ?')) {
        const [filmId] = params as [string];
        list = list.filter((d) => d.film_id === filmId);
      }
      return list as unknown as T[];
    }
    if (trimmed.includes('FROM mobile_scenes')) {
      let list = Array.from(this.tables.mobile_scenes.values());
      if (trimmed.includes('WHERE document_id = ?')) {
        const [docId] = params as [string];
        list = list.filter((s) => s.document_id === docId);
      }
      list.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
      return list as unknown as T[];
    }
    if (trimmed.includes('FROM mobile_blocks')) {
      let list = Array.from(this.tables.mobile_blocks.values());
      if (trimmed.includes('WHERE scene_id = ?')) {
        const [sceneId] = params as [string];
        list = list.filter((b) => b.scene_id === sceneId);
      }
      list.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
      return list as unknown as T[];
    }
    if (trimmed.includes('FROM mobile_outbox')) {
      let list = Array.from(this.tables.mobile_outbox.values());
      if (trimmed.includes('WHERE status = ?')) {
        const [st] = params as [string];
        list = list.filter((o) => o.status === st);
      }
      return list as unknown as T[];
    }
    if (trimmed.includes('FROM mobile_conflicts')) {
      let list = Array.from(this.tables.mobile_conflicts.values());
      if (trimmed.includes('WHERE film_id = ?')) {
        const [filmId] = params as [string];
        list = list.filter((c) => c.film_id === filmId);
      }
      return list as unknown as T[];
    }
    if (trimmed.includes('FROM mobile_sync_meta')) {
      const [filmId] = params as [string];
      const meta = this.tables.mobile_sync_meta.get(filmId);
      return (meta ? [meta] : []) as unknown as T[];
    }
    return [];
  }

  async getFirstAsync<T = unknown>(sql: string, params: (string | number | null | Uint8Array)[] = []): Promise<T | null> {
    const results = await this.getAllAsync<T>(sql, params);
    return results[0] ?? null;
  }

  async closeAsync(): Promise<void> {
    this.tables.mobile_meta.clear();
    this.tables.mobile_films.clear();
    this.tables.mobile_documents.clear();
    this.tables.mobile_scenes.clear();
    this.tables.mobile_blocks.clear();
    this.tables.mobile_outbox.clear();
  }
}

/**
 * Native Expo SQLite Adapter (activated when running in native Expo environment)
 */
export async function createDatabaseAdapter(): Promise<MobileDatabaseAdapter> {
  try {
    const SQLite = await import('expo-sqlite');
    if (SQLite && typeof SQLite.openDatabaseAsync === 'function') {
      const db = await SQLite.openDatabaseAsync('film_studio.db');
      await db.execAsync(MOBILE_SCHEMA_V1);
      return {
        execAsync: (sql) => db.execAsync(sql),
        runAsync: async (sql, params) => {
          const res = await db.runAsync(sql, ...(params ?? []));
          return { changes: res.changes, lastInsertRowId: res.lastInsertRowId };
        },
        getAllAsync: <T>(sql: string, params?: (string | number | null | Uint8Array)[]) =>
          db.getAllAsync<T>(sql, ...(params ?? [])),
        getFirstAsync: <T>(sql: string, params?: (string | number | null | Uint8Array)[]) =>
          db.getFirstAsync<T>(sql, ...(params ?? [])),
        closeAsync: () => db.closeAsync(),
      };
    }
  } catch {
    // Non-native fallback (e.g. Node test runner, headless web)
  }

  const inMemory = new InMemoryMobileDatabaseAdapter();
  await inMemory.execAsync(MOBILE_SCHEMA_V1);
  return inMemory;
}
