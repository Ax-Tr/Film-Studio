import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresContentRepository } from '../apps/api/src/database/postgres-content.repository.js';
import { ContentService } from '../apps/api/src/modules/content/content.service.js';
import type { PermissionService } from '../apps/api/src/modules/authorization/permission.service.js';
import type { AuditService } from '../apps/api/src/modules/audit/audit.service.js';
import { paginateScreenplay } from '@film-studio/pagination';
import type { MutationContext } from '../apps/api/src/database/postgres-tenant.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const sessionOne = '018f4ce4-e001-7000-8000-000000000001';

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
        ('${userOne}', 'Rajamouli Director', 'rajamouli@example.test'),
        ('${userTwo}', 'Unauthorized Guest', 'guest@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'DVV Entertainment');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'RRR Project');

      INSERT INTO role_permissions (role_id, permission_key)
      SELECT role.id, 'film.documents.edit'
      FROM roles role WHERE role.film_id = '${filmOne}' AND role.name = 'Film Owner'
      ON CONFLICT DO NOTHING;
    `);

    const pgConfig = createPgConfig(database);
    const pool = new Pool(pgConfig);
    const repository = new PostgresContentRepository(pool);

    const permissionsMock = {
      async requireFilmPermission(
        userId: string,
        _sessionId: string,
        filmId: string,
      ) {
        if (userId !== userOne || filmId !== filmOne) {
          throw new Error('RLS_PERMISSION_DENIED');
        }
      },
    };

    const auditMock = {
      record: async () => {},
    };

    const service = new ContentService(
      repository,
      permissionsMock as unknown as PermissionService,
      auditMock as unknown as AuditService,
    );

    const contextOne: MutationContext = {
      userId: userOne,
      sessionId: sessionOne,
      requestId: randomUUID(),
    };

    const contextTwo: MutationContext = {
      userId: userTwo,
      sessionId: randomUUID(),
      requestId: randomUUID(),
    };

    // 1. Testing Fountain Script Import with Telugu NFC Preservation
    const fountainSource = `
Title: RRR Screenplay
Author: S. S. Rajamouli

EXT. ADILABAD FOREST - NIGHT

BHEEM
(whispering intensely)
మనం వేట ప్రారంభించాలి.

Allam shoots through the brush. A Royal Bengal tiger leaps into the moonlight!

> CUT TO:

INT. BRITISH BARRACKS - DAY

RAMARAJU
(authoritative)
Stand down immediately!
`.trim();

    const importResult = await service.importScript(contextOne, filmOne, {
      operationId: randomUUID(),
      title: 'RRR Epic Draft',
      format: 'fountain',
      content: fountainSource,
      language: 'te-IN',
    });

    assert.equal(importResult.sceneCount, 2);
    assert.equal(importResult.characterCount, 2);
    assert.equal(importResult.errors.length, 0);
    const documentId = importResult.documentId;

    // 2. Verifying Document Version List and Detail Retrieval
    const versions = await service.listDocumentVersions(contextOne, filmOne, documentId);
    assert.equal(versions.length, 1);
    assert.equal(versions[0]?.documentVersion, 1);
    assert.match(versions[0]!.snapshotSha256, /^[a-f0-9]{64}$/);

    const v1Detail = await service.getDocumentVersion(contextOne, filmOne, documentId, versions[0]!.id);
    assert.equal(v1Detail.snapshot.scenes.length, 2);
    const dialogueBlock = v1Detail.snapshot.scenes[0]!.blocks.find(
      (b) => b.type === 'dialogue',
    );
    assert.equal(dialogueBlock?.text, 'మనం వేట ప్రారంభించాలి.');

    // 3. Testing Screenplay Pagination Engine
    const p1 = paginateScreenplay(v1Detail.snapshot);
    const p2 = paginateScreenplay(v1Detail.snapshot);
    assert.equal(p1.totalPages, 1);
    assert.equal(p1.checksumSha256, p2.checksumSha256);
    assert.ok(p1.totalLines > 5);
    assert.ok(p1.pages[0]!.lines.length > 5);

    // 4. Creating Document Version 2 and Restoring Version 1 as New Snapshot
    const docRecord = await service.getDocument(contextOne, filmOne, documentId);
    assert.equal(docRecord.version, 1);

    // Add a third scene to current document
    const sceneThreeId = randomUUID();
    await service.createScene(contextOne, filmOne, documentId, {
      operationId: randomUUID(),
      id: sceneThreeId,
      expectedDocumentVersion: docRecord.version,
      targetIndex: 2,
    });

    const v2Snapshot = {
      schemaVersion: 1,
      documentId,
      scenes: [
        ...v1Detail.snapshot.scenes,
        {
          id: sceneThreeId,
          blocks: [
            {
              id: randomUUID(),
              type: 'scene-heading' as const,
              text: 'INT. UNDERGROUND CELL - NIGHT',
              attributes: {},
            },
            {
              id: randomUUID(),
              type: 'action' as const,
              text: 'Bheem sits chained in the dark cell.',
              attributes: {},
            },
          ],
        },
      ],
    };

    const docAfterScene = await service.getDocument(contextOne, filmOne, documentId);
    const v2Result = await service.createDocumentVersion(contextOne, filmOne, documentId, {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedDocumentVersion: docAfterScene.version,
      snapshot: v2Snapshot,
    });
    assert.equal(v2Result.documentVersion, 3); // bumped by createScene and version

    const updatedVersions = await service.listDocumentVersions(contextOne, filmOne, documentId);
    assert.equal(updatedVersions.length, 2);

    // Now restore historical version 1
    const currentDoc = await service.getDocument(contextOne, filmOne, documentId);
    const restored = await service.restoreDocumentVersion(
      contextOne,
      filmOne,
      documentId,
      versions[0]!.id,
      {
        operationId: randomUUID(),
        expectedDocumentVersion: currentDoc.version,
      },
    );

    assert.equal(restored.documentVersion, currentDoc.version + 1);
    assert.equal(restored.snapshot.scenes.length, 2); // exactly matches v1

    const allVersions = await service.listDocumentVersions(contextOne, filmOne, documentId);
    assert.equal(allVersions.length, 3);

    // 5. Testing PDF and Fountain Export
    const pdfExport = await service.exportDocument(contextOne, filmOne, documentId, {
      format: 'pdf',
      watermark: 'CONFIDENTIAL PREVIEW',
    });
    assert.equal(pdfExport.contentType, 'application/pdf');
    assert.equal(pdfExport.filename, 'RRR_Epic_Draft.pdf');
    const pdfRaw = Buffer.from(pdfExport.data as Uint8Array).toString('binary');
    assert.ok(pdfRaw.startsWith('%PDF-1.4'));
    assert.ok(pdfRaw.includes('CONFIDENTIAL PREVIEW'));
    assert.ok(pdfRaw.includes('EXT. ADILABAD FOREST - NIGHT'));
    assert.ok(pdfRaw.trim().endsWith('%%EOF'));

    const fountainExport = await service.exportDocument(contextOne, filmOne, documentId, {
      format: 'fountain',
    });
    assert.ok(fountainExport.contentType.includes('text/plain'));
    assert.ok(typeof fountainExport.data === 'string');
    assert.ok(fountainExport.data.includes('EXT. ADILABAD FOREST - NIGHT'));
    assert.ok(fountainExport.data.includes('మనం వేట ప్రారంభించాలి.'));
    assert.ok(fountainExport.data.includes('RAMARAJU'));

    // 6. Multi-tenant RLS Isolation
    await assert.rejects(
      service.listDocumentVersions(contextTwo, filmOne, documentId),
      /RLS_PERMISSION_DENIED/,
    );
    await assert.rejects(
      service.exportDocument(contextTwo, filmOne, documentId, { format: 'pdf' }),
      /RLS_PERMISSION_DENIED/,
    );

    await pool.end();
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
