import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresContentRepository } from '../apps/api/src/database/postgres-content.repository.js';
import type { MutationIdentity } from '../apps/api/src/modules/content/content.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-aa7f-76a7-b2f1-38d5d2b6c577';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const documentOne = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const documentTwo = '018f4ce4-c8c1-7edc-9cb8-3a76ea988692';
const sceneOne = '018f4ce4-d16a-78b4-b2b1-85ec72e26323';
const sceneTwo = '018f4ce4-d95a-72e3-884b-f190e7ce0d3d';
const versionOne = '018f4ce4-e1e8-7e76-b481-55c23f3d7d4f';
const blockOne = '018f4ce4-e97c-7a70-8a60-e2618aa788d2';

function mutation(
  operationId: string,
  userId = userOne,
  filmId = filmOne,
  input = operationId,
): MutationIdentity {
  return {
    operationId,
    userId,
    filmId,
    requestHash: createHash('sha256').update(input).digest(),
  };
}

async function expectCode(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      String(error.code) === expectedCode
    ) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected ${expectedCode} but the operation succeeded.`);
}

async function main(): Promise<void> {
  const database = new PGlite();
  const migrationDirectory = fileURLToPath(
    new URL('../infra/database/migrations/', import.meta.url),
  );
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  try {
    for (const name of migrationNames) {
      await database.exec(
        await readFile(
          new URL(`../infra/database/migrations/${name}`, import.meta.url),
          'utf8',
        ),
      );
    }
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${userOne}', 'Canonical User One', 'canonical-one@example.test'),
        ('${userTwo}', 'Canonical User Two', 'canonical-two@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Canonical Org One');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Canonical Film One');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Canonical Org Two');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Canonical Film Two');

      CREATE ROLE app_content_runtime NOLOGIN NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public, app_security TO app_content_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        documents, document_versions, acts, sequences, scenes,
        document_scene_order, screenplay_block_projections, characters,
        model_mutations TO app_content_runtime;
    `);

    const pool = new Pool({
      ...(createPgConfig(database) as unknown as Record<string, unknown>),
      max: 1,
    });
    try {
      await pool.query('SET ROLE app_content_runtime');
      const repository = new PostgresContentRepository(pool);

      const created = await repository.createDocument(
        mutation('018f4ce4-f14d-7f20-ac70-ca50bc2d1f20'),
        {
          id: documentOne,
          title: 'తెలుగు Screenplay',
          kind: 'screenplay',
          language: 'te-IN',
        },
      );
      if (created.version !== 1 || created.title !== 'తెలుగు Screenplay') {
        throw new Error('Document create did not preserve canonical input.');
      }
      const retried = await repository.createDocument(
        mutation('018f4ce4-f14d-7f20-ac70-ca50bc2d1f20'),
        {
          id: documentOne,
          title: 'తెలుగు Screenplay',
          kind: 'screenplay',
          language: 'te-IN',
        },
      );
      if (retried.id !== documentOne || retried.version !== 1) {
        throw new Error('Idempotent document retry changed the resource.');
      }
      await expectCode(
        repository.createDocument(
          mutation(
            '018f4ce4-f14d-7f20-ac70-ca50bc2d1f20',
            userOne,
            filmOne,
            'different request',
          ),
          {
            id: documentOne,
            title: 'Changed retry',
            kind: 'screenplay',
            language: 'te-IN',
          },
        ),
        'MODEL_OPERATION_REUSED',
      );

      const updated = await repository.updateDocument(
        mutation('018f4ce4-f988-75f4-82df-c2d600340c80'),
        documentOne,
        { expectedVersion: 1, title: 'Revised title' },
      );
      if (updated.version !== 2)
        throw new Error('Optimistic update did not advance version.');

      await repository.createScene(
        mutation('018f4ce5-01e6-723f-a0ec-940c3884e00e'),
        documentOne,
        { id: sceneOne, expectedDocumentVersion: 2, targetIndex: 0 },
      );
      await repository.createScene(
        mutation('018f4ce5-09b4-74fd-9925-f08291d40269'),
        documentOne,
        { id: sceneTwo, expectedDocumentVersion: 3, targetIndex: 1 },
      );
      const moved = await repository.moveScene(
        mutation('018f4ce5-11aa-79a3-9362-d7f405857454'),
        documentOne,
        sceneTwo,
        {
          expectedDocumentVersion: 4,
          expectedSceneVersion: 1,
          targetIndex: 0,
        },
      );
      if (moved.index !== 0 || moved.version !== 2) {
        throw new Error('Scene move did not preserve the stable ID/version.');
      }
      await repository.deleteScene(
        mutation('018f4ce5-1990-7ccb-89fb-d5af9e8135ae'),
        documentOne,
        sceneTwo,
        5,
        2,
      );
      const restored = await repository.restoreScene(
        mutation('018f4ce5-2186-748c-a367-6f19ad214e14'),
        documentOne,
        sceneTwo,
        {
          expectedDocumentVersion: 6,
          expectedSceneVersion: 3,
          targetIndex: 1,
        },
      );
      if (
        restored.id !== sceneTwo ||
        restored.index !== 1 ||
        restored.deletedAt !== null
      ) {
        throw new Error('Scene restore did not retain the stable scene ID.');
      }

      const snapshot = {
        schemaVersion: 1 as const,
        documentId: documentOne,
        scenes: [
          {
            id: sceneOne,
            blocks: [
              {
                id: blockOne,
                type: 'action' as const,
                text: 'వర్షం మొదలవుతుంది.',
                attributes: {},
              },
            ],
          },
          { id: sceneTwo, blocks: [] },
        ],
      };
      const snapshotHash = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest();
      const version = await repository.createDocumentVersion(
        mutation('018f4ce5-297c-7c65-a925-f69c5aead17a'),
        documentOne,
        versionOne,
        7,
        snapshot,
        snapshotHash,
      );
      if (version.documentVersion !== 8) {
        throw new Error('Immutable snapshot did not advance document version.');
      }
      await expectCode(
        repository.updateDocument(
          mutation('018f4ce5-3172-7417-85a0-002ec618ce9f'),
          documentOne,
          { expectedVersion: 7, title: 'Stale write' },
        ),
        'MODEL_VERSION_CONFLICT',
      );

      const foreignRead = await repository.getDocument(
        userTwo,
        filmOne,
        documentOne,
      );
      if (foreignRead !== undefined)
        throw new Error('Cross-film document read bypassed RLS.');
      await repository.createDocument(
        mutation('018f4ce5-3968-7cc9-862b-1c6840a22e45', userTwo, filmTwo),
        {
          id: documentTwo,
          title: 'Other tenant document',
          kind: 'screenplay',
          language: 'en',
        },
      );
      const ownDocuments = await repository.listDocuments(userOne, filmOne);
      if (ownDocuments.length !== 1 || ownDocuments[0]?.id !== documentOne) {
        throw new Error('Document listing leaked another film.');
      }

      let immutableRejected = false;
      const immutableClient = await pool.connect();
      try {
        await immutableClient.query('RESET ROLE');
        await immutableClient.query('BEGIN');
        await immutableClient.query(
          `UPDATE document_versions SET schema_version = 2 WHERE id = $1`,
          [versionOne],
        );
      } catch {
        immutableRejected = true;
      } finally {
        await immutableClient.query('ROLLBACK');
        immutableClient.release();
      }
      if (!immutableRejected)
        throw new Error('Immutable document version was updated.');
    } finally {
      await pool.end();
    }
  } finally {
    await database.close();
  }

  process.stdout.write(
    'Canonical repository verified: idempotency, optimistic versions, move, tombstone/restore, immutable snapshot, and tenant isolation.\n',
  );
}

void main();
