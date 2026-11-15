import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  projectBlocks,
  stableJson,
  type ScreenplayDocument,
} from '@film-studio/screenplay-model';
import { codedError } from '../modules/content/content.service.js';
import type {
  ContentRepository,
  DocumentRecord,
  DocumentVersionDetailRecord,
  DocumentVersionSummaryRecord,
  MutationIdentity,
  SceneRecord,
} from '../modules/content/content.repository.js';

interface DocumentRow {
  id: string;
  film_id: string;
  title: string;
  kind: string;
  language: string;
  version: string;
  archived_at: Date | string | null;
  deleted_at: Date | string | null;
}

interface SceneRow {
  id: string;
  film_id: string;
  document_id: string;
  version: string;
  position: string | null;
  deleted_at: Date | string | null;
}

interface MutationRow {
  operation_key: string;
  request_sha256: Uint8Array;
  response: unknown;
}

export class PostgresContentRepository implements ContentRepository {
  constructor(private readonly pool: Pool) {}

  createDocument(
    mutation: MutationIdentity,
    input: {
      readonly id: string;
      readonly title: string;
      readonly kind: string;
      readonly language: string;
    },
  ): Promise<DocumentRecord> {
    return this.mutate(mutation, 'document.create', async (client) => {
      const result = await client.query<DocumentRow>(
        `INSERT INTO documents (
           id, film_id, title, kind, language, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.id,
          mutation.filmId,
          input.title,
          input.kind,
          input.language,
          mutation.userId,
        ],
      );
      return this.document(result.rows[0]);
    });
  }

  updateDocument(
    mutation: MutationIdentity,
    documentId: string,
    input: {
      readonly expectedVersion: number;
      readonly title?: string | undefined;
      readonly kind?: string | undefined;
      readonly language?: string | undefined;
      readonly archived?: boolean | undefined;
    },
  ): Promise<DocumentRecord> {
    return this.mutate(mutation, 'document.update', async (client) => {
      const result = await client.query<DocumentRow>(
        `UPDATE documents SET
           title = COALESCE($4, title),
           kind = COALESCE($5, kind),
           language = COALESCE($6, language),
           archived_at = CASE
             WHEN $7::boolean IS NULL THEN archived_at
             WHEN $7 THEN COALESCE(archived_at, now())
             ELSE NULL
           END,
           version = version + 1,
           updated_at = now()
         WHERE film_id = $1 AND id = $2 AND version = $3 AND deleted_at IS NULL
         RETURNING *`,
        [
          mutation.filmId,
          documentId,
          input.expectedVersion,
          input.title ?? null,
          input.kind ?? null,
          input.language ?? null,
          input.archived ?? null,
        ],
      );
      if (result.rows[0] === undefined) {
        await this.versionFailure(
          client,
          'documents',
          mutation.filmId,
          documentId,
        );
      }
      return this.document(result.rows[0]);
    });
  }

  getDocument(
    userId: string,
    filmId: string,
    documentId: string,
  ): Promise<DocumentRecord | undefined> {
    return this.read(userId, filmId, async (client) => {
      const result = await client.query<DocumentRow>(
        'SELECT * FROM documents WHERE film_id = $1 AND id = $2',
        [filmId, documentId],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : this.document(row);
    });
  }

  listDocuments(
    userId: string,
    filmId: string,
  ): Promise<readonly DocumentRecord[]> {
    return this.read(userId, filmId, async (client) => {
      const result = await client.query<DocumentRow>(
        `SELECT * FROM documents
         WHERE film_id = $1 AND deleted_at IS NULL
         ORDER BY updated_at DESC, id`,
        [filmId],
      );
      return result.rows.map((row) => this.document(row));
    });
  }

  createScene(
    mutation: MutationIdentity,
    documentId: string,
    input: {
      readonly id: string;
      readonly expectedDocumentVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord> {
    return this.mutate(mutation, 'scene.create', async (client) => {
      await this.lockDocument(
        client,
        mutation.filmId,
        documentId,
        input.expectedDocumentVersion,
      );
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      const count = await this.sceneCount(client, mutation.filmId, documentId);
      if (input.targetIndex > count) throw codedError('MODEL_INDEX_INVALID');
      await client.query(
        `UPDATE document_scene_order SET position = position + 1
         WHERE film_id = $1 AND document_id = $2 AND position >= $3`,
        [mutation.filmId, documentId, input.targetIndex],
      );
      await client.query(
        `INSERT INTO scenes (id, film_id, document_id)
         VALUES ($1, $2, $3)`,
        [input.id, mutation.filmId, documentId],
      );
      await client.query(
        `INSERT INTO document_scene_order (film_id, document_id, scene_id, position)
         VALUES ($1, $2, $3, $4)`,
        [mutation.filmId, documentId, input.id, input.targetIndex],
      );
      await this.bumpDocument(client, mutation.filmId, documentId);
      return this.requireScene(client, mutation.filmId, documentId, input.id);
    });
  }

  moveScene(
    mutation: MutationIdentity,
    documentId: string,
    sceneId: string,
    input: {
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord> {
    return this.mutate(mutation, 'scene.move', async (client) => {
      await this.lockDocument(
        client,
        mutation.filmId,
        documentId,
        input.expectedDocumentVersion,
      );
      const scene = await this.lockScene(
        client,
        mutation.filmId,
        documentId,
        sceneId,
        input.expectedSceneVersion,
        false,
      );
      const count = await this.sceneCount(client, mutation.filmId, documentId);
      if (input.targetIndex >= count) throw codedError('MODEL_INDEX_INVALID');
      const currentIndex = Number(scene.position);
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      if (input.targetIndex < currentIndex) {
        await client.query(
          `UPDATE document_scene_order SET position = position + 1
           WHERE film_id = $1 AND document_id = $2
             AND position >= $3 AND position < $4`,
          [mutation.filmId, documentId, input.targetIndex, currentIndex],
        );
      } else if (input.targetIndex > currentIndex) {
        await client.query(
          `UPDATE document_scene_order SET position = position - 1
           WHERE film_id = $1 AND document_id = $2
             AND position > $3 AND position <= $4`,
          [mutation.filmId, documentId, currentIndex, input.targetIndex],
        );
      }
      await client.query(
        `UPDATE document_scene_order SET position = $4
         WHERE film_id = $1 AND document_id = $2 AND scene_id = $3`,
        [mutation.filmId, documentId, sceneId, input.targetIndex],
      );
      await client.query(
        `UPDATE scenes SET version = version + 1, updated_at = now()
         WHERE film_id = $1 AND document_id = $2 AND id = $3`,
        [mutation.filmId, documentId, sceneId],
      );
      await this.bumpDocument(client, mutation.filmId, documentId);
      return this.requireScene(client, mutation.filmId, documentId, sceneId);
    });
  }

  deleteScene(
    mutation: MutationIdentity,
    documentId: string,
    sceneId: string,
    expectedDocumentVersion: number,
    expectedSceneVersion: number,
  ): Promise<SceneRecord> {
    return this.mutate(mutation, 'scene.delete', async (client) => {
      await this.lockDocument(
        client,
        mutation.filmId,
        documentId,
        expectedDocumentVersion,
      );
      const scene = await this.lockScene(
        client,
        mutation.filmId,
        documentId,
        sceneId,
        expectedSceneVersion,
        false,
      );
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      await client.query(
        `DELETE FROM document_scene_order
         WHERE film_id = $1 AND document_id = $2 AND scene_id = $3`,
        [mutation.filmId, documentId, sceneId],
      );
      await client.query(
        `UPDATE document_scene_order SET position = position - 1
         WHERE film_id = $1 AND document_id = $2 AND position > $3`,
        [mutation.filmId, documentId, Number(scene.position)],
      );
      await client.query(
        `UPDATE scenes SET deleted_at = now(), version = version + 1, updated_at = now()
         WHERE film_id = $1 AND document_id = $2 AND id = $3`,
        [mutation.filmId, documentId, sceneId],
      );
      await this.bumpDocument(client, mutation.filmId, documentId);
      return this.requireScene(client, mutation.filmId, documentId, sceneId);
    });
  }

  restoreScene(
    mutation: MutationIdentity,
    documentId: string,
    sceneId: string,
    input: {
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord> {
    return this.mutate(mutation, 'scene.restore', async (client) => {
      await this.lockDocument(
        client,
        mutation.filmId,
        documentId,
        input.expectedDocumentVersion,
      );
      await this.lockScene(
        client,
        mutation.filmId,
        documentId,
        sceneId,
        input.expectedSceneVersion,
        true,
      );
      const count = await this.sceneCount(client, mutation.filmId, documentId);
      if (input.targetIndex > count) throw codedError('MODEL_INDEX_INVALID');
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      await client.query(
        `UPDATE document_scene_order SET position = position + 1
         WHERE film_id = $1 AND document_id = $2 AND position >= $3`,
        [mutation.filmId, documentId, input.targetIndex],
      );
      await client.query(
        `INSERT INTO document_scene_order (film_id, document_id, scene_id, position)
         VALUES ($1, $2, $3, $4)`,
        [mutation.filmId, documentId, sceneId, input.targetIndex],
      );
      await client.query(
        `UPDATE scenes SET deleted_at = NULL, version = version + 1, updated_at = now()
         WHERE film_id = $1 AND document_id = $2 AND id = $3`,
        [mutation.filmId, documentId, sceneId],
      );
      await this.bumpDocument(client, mutation.filmId, documentId);
      return this.requireScene(client, mutation.filmId, documentId, sceneId);
    });
  }

  listScenes(
    userId: string,
    filmId: string,
    documentId: string,
    includeDeleted: boolean,
  ): Promise<readonly SceneRecord[]> {
    return this.read(userId, filmId, async (client) => {
      const result = await client.query<SceneRow>(
        `SELECT scene.*, scene_order.position
         FROM scenes scene
         LEFT JOIN document_scene_order scene_order
           ON scene_order.film_id = scene.film_id
          AND scene_order.document_id = scene.document_id
          AND scene_order.scene_id = scene.id
         WHERE scene.film_id = $1 AND scene.document_id = $2
           AND ($3::boolean OR scene.deleted_at IS NULL)
         ORDER BY scene_order.position NULLS LAST, scene.created_at, scene.id`,
        [filmId, documentId, includeDeleted],
      );
      return result.rows.map((row) => this.scene(row));
    });
  }

  createDocumentVersion(
    mutation: MutationIdentity,
    documentId: string,
    versionId: string,
    expectedDocumentVersion: number,
    snapshot: ScreenplayDocument,
    snapshotHash: Uint8Array,
  ) {
    return this.mutate(mutation, 'document.version.create', async (client) => {
      await this.lockDocument(
        client,
        mutation.filmId,
        documentId,
        expectedDocumentVersion,
      );
      const orderedScenes = await client.query<{ id: string }>(
        `SELECT scene.id
           FROM document_scene_order scene_order
           JOIN scenes scene
             ON scene.film_id = scene_order.film_id
            AND scene.document_id = scene_order.document_id
            AND scene.id = scene_order.scene_id
           WHERE scene_order.film_id = $1 AND scene_order.document_id = $2
           ORDER BY scene_order.position`,
        [mutation.filmId, documentId],
      );
      if (
        orderedScenes.rows.map((row) => row.id).join(',') !==
        snapshot.scenes.map((scene) => scene.id).join(',')
      ) {
        throw codedError('MODEL_SNAPSHOT_MISMATCH');
      }
      const documentVersion = expectedDocumentVersion + 1;
      await client.query(
        `INSERT INTO document_versions (
             id, film_id, document_id, document_version, schema_version,
             snapshot, snapshot_sha256, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          versionId,
          mutation.filmId,
          documentId,
          documentVersion,
          snapshot.schemaVersion,
          snapshot,
          snapshotHash,
          mutation.userId,
        ],
      );
      await client.query(
        `DELETE FROM screenplay_block_projections
           WHERE film_id = $1 AND document_id = $2`,
        [mutation.filmId, documentId],
      );
      for (const block of projectBlocks(snapshot)) {
        await client.query(
          `INSERT INTO screenplay_block_projections (
               id, film_id, document_id, scene_id, source_document_version_id,
               position, block_type, text_content, attributes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            block.blockId,
            mutation.filmId,
            documentId,
            block.sceneId,
            versionId,
            block.blockIndex,
            block.type,
            block.text,
            block.attributes,
          ],
        );
      }
      await this.bumpDocument(client, mutation.filmId, documentId);
      return {
        id: versionId,
        documentId,
        documentVersion,
        snapshotSha256: Buffer.from(snapshotHash).toString('hex'),
      };
    });
  }

  async listDocumentVersions(
    userId: string,
    filmId: string,
    documentId: string,
  ): Promise<readonly DocumentVersionSummaryRecord[]> {
    return this.transaction(userId, filmId, async (client) => {
      const result = await client.query<{
        id: string;
        film_id: string;
        document_id: string;
        document_version: string;
        schema_version: number;
        snapshot_sha256: Buffer;
        created_by: string;
        created_at: Date | string;
      }>(
        `SELECT id, film_id, document_id, document_version, schema_version,
                snapshot_sha256, created_by, created_at
         FROM document_versions
         WHERE film_id = $1 AND document_id = $2
         ORDER BY document_version DESC`,
        [filmId, documentId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        filmId: row.film_id,
        documentId: row.document_id,
        documentVersion: Number(row.document_version),
        schemaVersion: row.schema_version,
        snapshotSha256: row.snapshot_sha256.toString('hex'),
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
      }));
    });
  }

  async getDocumentVersion(
    userId: string,
    filmId: string,
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersionDetailRecord | undefined> {
    return this.transaction(userId, filmId, async (client) => {
      const result = await client.query<{
        id: string;
        film_id: string;
        document_id: string;
        document_version: string;
        schema_version: number;
        snapshot: ScreenplayDocument;
        snapshot_sha256: Buffer;
        created_by: string;
        created_at: Date | string;
      }>(
        `SELECT id, film_id, document_id, document_version, schema_version,
                snapshot, snapshot_sha256, created_by, created_at
         FROM document_versions
         WHERE film_id = $1 AND document_id = $2 AND id = $3`,
        [filmId, documentId, versionId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        id: row.id,
        filmId: row.film_id,
        documentId: row.document_id,
        documentVersion: Number(row.document_version),
        schemaVersion: row.schema_version,
        snapshot: row.snapshot,
        snapshotSha256: row.snapshot_sha256.toString('hex'),
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
      };
    });
  }

  async restoreDocumentVersion(
    mutation: MutationIdentity,
    documentId: string,
    versionId: string,
    expectedDocumentVersion: number,
  ): Promise<DocumentVersionDetailRecord> {
    return this.mutate(mutation, 'document.version.restore', async (client) => {
      await this.lockDocument(
        client,
        mutation.filmId,
        documentId,
        expectedDocumentVersion,
      );
      const histResult = await client.query<{
        snapshot: ScreenplayDocument;
        schema_version: number;
      }>(
        `SELECT snapshot, schema_version
         FROM document_versions
         WHERE film_id = $1 AND document_id = $2 AND id = $3`,
        [mutation.filmId, documentId, versionId],
      );
      const histRow = histResult.rows[0];
      if (!histRow) throw codedError('MODEL_RESOURCE_NOT_FOUND');

      const snapshot = histRow.snapshot;
      const newVersionId = randomUUID();
      const newDocumentVersion = expectedDocumentVersion + 1;
      const serialized = stableJson(snapshot);
      const snapshotHash = createHash('sha256')
        .update(serialized, 'utf8')
        .digest();

      await client.query('SET CONSTRAINTS ALL DEFERRED');

      // Clear existing order
      await client.query(
        `DELETE FROM document_scene_order WHERE film_id = $1 AND document_id = $2`,
        [mutation.filmId, documentId],
      );

      const activeSceneIds = new Set<string>();
      for (let i = 0; i < snapshot.scenes.length; i++) {
        const sc = snapshot.scenes[i]!;
        activeSceneIds.add(sc.id);
        // Upsert scene
        await client.query(
          `INSERT INTO scenes (id, film_id, document_id, version, deleted_at, updated_at)
           VALUES ($1, $2, $3, 1, NULL, now())
           ON CONFLICT (film_id, document_id, id)
           DO UPDATE SET deleted_at = NULL, version = scenes.version + 1, updated_at = now()`,
          [sc.id, mutation.filmId, documentId],
        );
        // Insert order
        await client.query(
          `INSERT INTO document_scene_order (film_id, document_id, scene_id, position)
           VALUES ($1, $2, $3, $4)`,
          [mutation.filmId, documentId, sc.id, i],
        );
      }

      // Soft delete scenes that are not in restored snapshot
      if (activeSceneIds.size > 0) {
        await client.query(
          `UPDATE scenes SET deleted_at = now(), version = version + 1, updated_at = now()
           WHERE film_id = $1 AND document_id = $2 AND id NOT IN (${Array.from(activeSceneIds)
             .map((_, idx) => `$${idx + 3}`)
             .join(', ')})`,
          [mutation.filmId, documentId, ...Array.from(activeSceneIds)],
        );
      } else {
        await client.query(
          `UPDATE scenes SET deleted_at = now(), version = version + 1, updated_at = now()
           WHERE film_id = $1 AND document_id = $2`,
          [mutation.filmId, documentId],
        );
      }

      // Insert new document version
      await client.query(
        `INSERT INTO document_versions (
           id, film_id, document_id, document_version, schema_version,
           snapshot, snapshot_sha256, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newVersionId,
          mutation.filmId,
          documentId,
          newDocumentVersion,
          snapshot.schemaVersion,
          snapshot,
          snapshotHash,
          mutation.userId,
        ],
      );

      // Reproject blocks
      await client.query(
        `DELETE FROM screenplay_block_projections WHERE film_id = $1 AND document_id = $2`,
        [mutation.filmId, documentId],
      );

      for (const block of projectBlocks(snapshot)) {
        await client.query(
          `INSERT INTO screenplay_block_projections (
             id, film_id, document_id, scene_id, source_document_version_id,
             position, block_type, text_content, attributes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            block.blockId,
            mutation.filmId,
            documentId,
            block.sceneId,
            newVersionId,
            block.blockIndex,
            block.type,
            block.text,
            block.attributes,
          ],
        );
      }

      await this.bumpDocument(client, mutation.filmId, documentId);

      return {
        id: newVersionId,
        filmId: mutation.filmId,
        documentId,
        documentVersion: newDocumentVersion,
        schemaVersion: snapshot.schemaVersion,
        snapshot,
        snapshotSha256: snapshotHash.toString('hex'),
        createdBy: mutation.userId,
        createdAt: new Date().toISOString(),
      };
    });
  }

  async importScript(
    mutation: MutationIdentity,
    input: {
      readonly documentId: string;
      readonly title: string;
      readonly kind: string;
      readonly language: string;
      readonly document: ScreenplayDocument;
    },
  ): Promise<{
    readonly document: DocumentRecord;
    readonly versionId: string;
  }> {
    return this.mutate(mutation, 'document.import', async (client) => {
      const docResult = await client.query<DocumentRow>(
        `INSERT INTO documents (id, film_id, title, kind, language, version, created_by)
         VALUES ($1, $2, $3, $4, $5, 1, $6)
         RETURNING id, film_id, title, kind, language, version, archived_at, deleted_at`,
        [
          input.documentId,
          mutation.filmId,
          input.title,
          input.kind,
          input.language,
          mutation.userId,
        ],
      );
      const doc = this.document(docResult.rows[0]!);
      const versionId = randomUUID();
      const serialized = stableJson(input.document);
      const snapshotHash = createHash('sha256')
        .update(serialized, 'utf8')
        .digest();

      await client.query('SET CONSTRAINTS ALL DEFERRED');

      for (let i = 0; i < input.document.scenes.length; i++) {
        const sc = input.document.scenes[i]!;
        await client.query(
          `INSERT INTO scenes (id, film_id, document_id, version)
           VALUES ($1, $2, $3, 1)`,
          [sc.id, mutation.filmId, input.documentId],
        );
        await client.query(
          `INSERT INTO document_scene_order (film_id, document_id, scene_id, position)
           VALUES ($1, $2, $3, $4)`,
          [mutation.filmId, input.documentId, sc.id, i],
        );
      }

      await client.query(
        `INSERT INTO document_versions (
           id, film_id, document_id, document_version, schema_version,
           snapshot, snapshot_sha256, created_by
         ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7)`,
        [
          versionId,
          mutation.filmId,
          input.documentId,
          input.document.schemaVersion,
          input.document,
          snapshotHash,
          mutation.userId,
        ],
      );

      for (const block of projectBlocks(input.document)) {
        await client.query(
          `INSERT INTO screenplay_block_projections (
             id, film_id, document_id, scene_id, source_document_version_id,
             position, block_type, text_content, attributes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            block.blockId,
            mutation.filmId,
            input.documentId,
            block.sceneId,
            versionId,
            block.blockIndex,
            block.type,
            block.text,
            block.attributes,
          ],
        );
      }

      return {
        document: doc,
        versionId,
      };
    });
  }

  private async mutate<T extends object>(
    mutation: MutationIdentity,
    operationKey: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transaction(
        mutation.userId,
        mutation.filmId,
        async (client) => {
          const previous = await client.query<MutationRow>(
            `SELECT operation_key, request_sha256, response
           FROM model_mutations
           WHERE operation_id = $1 AND film_id = $2 AND actor_user_id = $3`,
            [mutation.operationId, mutation.filmId, mutation.userId],
          );
          const existing = previous.rows[0];
          if (existing !== undefined) {
            if (
              existing.operation_key !== operationKey ||
              !Buffer.from(existing.request_sha256).equals(
                Buffer.from(mutation.requestHash),
              )
            ) {
              throw codedError('MODEL_OPERATION_REUSED');
            }
            return existing.response as T;
          }
          const response = await operation(client);
          await client.query(
            `INSERT INTO model_mutations (
             operation_id, film_id, actor_user_id, operation_key,
             request_sha256, response
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              mutation.operationId,
              mutation.filmId,
              mutation.userId,
              operationKey,
              mutation.requestHash,
              response,
            ],
          );
          return response;
        },
      );
    } catch (error) {
      if (this.databaseCode(error) === '23505') {
        const constraint = this.databaseConstraint(error);
        throw codedError(
          constraint?.includes('model_mutations') === true
            ? 'MODEL_OPERATION_REUSED'
            : 'MODEL_ID_CONFLICT',
        );
      }
      throw error;
    }
  }

  private read<T>(
    userId: string,
    filmId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(userId, filmId, operation);
  }

  private async transaction<T>(
    userId: string,
    filmId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.film_id', $2, true)`,
        [userId, filmId],
      );
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockDocument(
    client: PoolClient,
    filmId: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<void> {
    const result = await client.query<{ version: string }>(
      `SELECT version FROM documents
       WHERE film_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [filmId, documentId],
    );
    const row = result.rows[0];
    if (row === undefined) throw codedError('MODEL_RESOURCE_NOT_FOUND');
    if (Number(row.version) !== expectedVersion) {
      throw codedError('MODEL_VERSION_CONFLICT');
    }
  }

  private async lockScene(
    client: PoolClient,
    filmId: string,
    documentId: string,
    sceneId: string,
    expectedVersion: number,
    requireDeleted: boolean,
  ): Promise<SceneRow> {
    const result = await client.query<SceneRow>(
      `SELECT scene.*, scene_order.position
       FROM scenes scene
       LEFT JOIN document_scene_order scene_order
         ON scene_order.film_id = scene.film_id
        AND scene_order.document_id = scene.document_id
        AND scene_order.scene_id = scene.id
       WHERE scene.film_id = $1 AND scene.document_id = $2 AND scene.id = $3
       FOR UPDATE OF scene`,
      [filmId, documentId, sceneId],
    );
    const row = result.rows[0];
    if (
      row === undefined ||
      (requireDeleted ? row.deleted_at === null : row.deleted_at !== null)
    ) {
      throw codedError('MODEL_RESOURCE_NOT_FOUND');
    }
    if (Number(row.version) !== expectedVersion) {
      throw codedError('MODEL_VERSION_CONFLICT');
    }
    return row;
  }

  private async versionFailure(
    client: PoolClient,
    table: 'documents',
    filmId: string,
    id: string,
  ): Promise<never> {
    const found = await client.query(
      `SELECT 1 FROM ${table} WHERE film_id = $1 AND id = $2`,
      [filmId, id],
    );
    throw codedError(
      found.rows.length === 0
        ? 'MODEL_RESOURCE_NOT_FOUND'
        : 'MODEL_VERSION_CONFLICT',
    );
  }

  private async sceneCount(
    client: PoolClient,
    filmId: string,
    documentId: string,
  ): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM document_scene_order
       WHERE film_id = $1 AND document_id = $2`,
      [filmId, documentId],
    );
    return result.rows[0]?.count ?? 0;
  }

  private async bumpDocument(
    client: PoolClient,
    filmId: string,
    documentId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE documents SET version = version + 1, updated_at = now()
       WHERE film_id = $1 AND id = $2`,
      [filmId, documentId],
    );
  }

  private async requireScene(
    client: PoolClient,
    filmId: string,
    documentId: string,
    sceneId: string,
  ): Promise<SceneRecord> {
    const result = await client.query<SceneRow>(
      `SELECT scene.*, scene_order.position
       FROM scenes scene
       LEFT JOIN document_scene_order scene_order
         ON scene_order.film_id = scene.film_id
        AND scene_order.document_id = scene.document_id
        AND scene_order.scene_id = scene.id
       WHERE scene.film_id = $1 AND scene.document_id = $2 AND scene.id = $3`,
      [filmId, documentId, sceneId],
    );
    const row = result.rows[0];
    if (row === undefined) throw codedError('MODEL_RESOURCE_NOT_FOUND');
    return this.scene(row);
  }

  private document(row: DocumentRow | undefined): DocumentRecord {
    if (row === undefined) throw codedError('MODEL_RESOURCE_NOT_FOUND');
    return {
      id: row.id,
      filmId: row.film_id,
      title: row.title,
      kind: row.kind,
      language: row.language,
      version: Number(row.version),
      archivedAt: this.timestamp(row.archived_at),
      deletedAt: this.timestamp(row.deleted_at),
    };
  }

  private scene(row: SceneRow): SceneRecord {
    return {
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      version: Number(row.version),
      index: row.position === null ? null : Number(row.position),
      deletedAt: this.timestamp(row.deleted_at),
    };
  }

  private timestamp(value: Date | string | null): string | null {
    if (value === null) return null;
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private databaseCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }

  private databaseConstraint(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'constraint' in error
      ? String(error.constraint)
      : undefined;
  }
}
