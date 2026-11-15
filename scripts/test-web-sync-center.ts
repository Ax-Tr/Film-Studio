import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresSyncRepository } from '../backend/src/database/postgres-sync.repository.js';
import { SyncService } from '../backend/src/modules/sync/sync.service.js';
import { WebSyncManager } from '../frontend/app/lib/sync-manager.js';
import type { MutationContext } from '../backend/src/database/postgres-tenant.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const documentOne = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const sceneOne = '018f4ce4-d16a-78b4-b2b1-85ec72e26323';
const deviceOne = '018f4ce4-f001-7000-8000-000000000001';
const deviceTwo = '018f4ce4-f002-7000-8000-000000000002';
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
        ('${userOne}', 'Sync User One', 'sync-one@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Sync Org One');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Sync Film One');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by, version)
      VALUES ('${documentOne}', '${filmOne}', 'Original Film Script', 'screenplay', 'te-IN', '${userOne}', 1);

      INSERT INTO scenes (id, film_id, document_id, version)
      VALUES ('${sceneOne}', '${filmOne}', '${documentOne}', 1);

      INSERT INTO role_permissions (role_id, permission_key)
      SELECT role.id, 'film.documents.edit'
      FROM roles role WHERE role.film_id = '${filmOne}' AND role.name = 'Film Owner'
      ON CONFLICT DO NOTHING;

      CREATE ROLE app_sync_runtime NOLOGIN NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public, app_security TO app_sync_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        films, documents, document_versions, acts, sequences, scenes,
        document_scene_order, screenplay_block_projections, characters,
        model_mutations, sync_device_sequences, operation_ledger,
        sync_device_acks, sync_conflicts, scene_crdt_updates,
        scene_crdt_snapshots TO app_sync_runtime;
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresSyncRepository(pool);
    const mockPermissions = {
      requireFilmPermission: async () => Promise.resolve(),
      checkFilmPermission: async () => true,
    } as unknown as Parameters<typeof SyncService.prototype.constructor>[1];
    const mockAudit = {
      record: async () => Promise.resolve(),
    } as unknown as Parameters<typeof SyncService.prototype.constructor>[2];

    const service = new SyncService(repo, mockPermissions, mockAudit);

    const ctx: MutationContext = {
      userId: userOne,
      sessionId: sessionOne,
      requestId: '018f4ce4-f999-7000-8000-000000000001',
    };

    // 1. Verify PWA Assets exist
    const manifestRaw = await readFile(
      new URL('../frontend/public/manifest.json', import.meta.url),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as { name: string; display: string };
    assert.equal(manifest.name, 'Film Studio');
    assert.equal(manifest.display, 'standalone');

    const swRaw = await readFile(
      new URL('../frontend/public/sw.js', import.meta.url),
      'utf8',
    );
    assert.ok(swRaw.includes('CACHE_NAME'));
    assert.ok(swRaw.includes('skipWaiting()'));

    // 2. Test WebSyncManager queueing and state transitions
    const syncManager = new WebSyncManager(filmOne, deviceOne, 'http://localhost:3000');
    assert.equal(syncManager.getPending().length, 0);

    const offlineStatus = syncManager.getStatus(true);
    assert.equal(offlineStatus.state, 'offline');
    assert.equal(offlineStatus.pendingCount, 0);

    // Enqueue an offline operation
    const op1 = syncManager.enqueue({
      schemaVersion: 1,
      opId: '018f4ce4-fa01-7000-8000-000000000001',
      filmId: filmOne,
      actorUserId: userOne,
      deviceId: deviceOne,
      entityType: 'document',
      entityId: documentOne,
      kind: 'document.metadata.patch',
      baseVersion: 1,
      payload: { title: 'Updated from Device 1' },
    });

    assert.equal(syncManager.getPending().length, 1);
    assert.equal(op1.clientSequence, 1);
    assert.ok(op1.createdAtClient);

    // 3. Push operation via SyncService (as backend does)
    const pushResult = await service.pushOperations(ctx, filmOne, [
      {
        schemaVersion: 1,
        opId: op1.opId,
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceOne,
        clientSequence: op1.clientSequence,
        entityType: 'document',
        entityId: documentOne,
        kind: 'document.metadata.patch',
        baseVersion: 1,
        payload: { title: 'Updated from Device 1' },
        createdAtClient: op1.createdAtClient,
      },
    ]);

    assert.equal(pushResult.results.length, 1);
    assert.equal(pushResult.results[0]!.status, 'applied');
    assert.equal(pushResult.latestServerRevision, 1);

    // 4. Emulate concurrent conflicting operation from Device 2 with stale baseVersion: 1
    const pushConflictResult = await service.pushOperations(ctx, filmOne, [
      {
        schemaVersion: 1,
        opId: '018f4ce4-fa02-7000-8000-000000000002',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceTwo,
        clientSequence: 1,
        entityType: 'document',
        entityId: documentOne,
        kind: 'document.metadata.patch',
        baseVersion: 1, // Stale! Document is now at version 2, and 'title' was updated in op1
        payload: { title: 'Conflicting Title from Device 2' },
        createdAtClient: new Date().toISOString(),
      },
    ]);

    assert.equal(pushConflictResult.results.length, 1);
    assert.equal(pushConflictResult.results[0]!.status, 'conflict');
    const conflictId = pushConflictResult.results[0]!.conflictId;
    assert.ok(conflictId, 'Conflict ID must be generated');

    // 5. Query conflicts for filmOne
    const activeConflicts = await service.listConflicts(ctx, filmOne);
    assert.equal(activeConflicts.length, 1);
    assert.equal(activeConflicts[0]!.id, conflictId);
    assert.equal(activeConflicts[0]!.conflictType, 'SAME_FIELD_CHANGED');

    // 6. Resolve conflict with keep_local
    const resolved = await service.resolveConflict(ctx, filmOne, conflictId, {
      choice: 'keep_local',
    });
    assert.equal(resolved.resolutionStrategy, 'keep_local');
    assert.ok(resolved.resolvedAt);

    // Verify conflicts list is now empty (resolved conflicts excluded from active list)
    const remainingConflicts = await service.listConflicts(ctx, filmOne);
    assert.equal(remainingConflicts.length, 0);

    // 7. Acknowledge revision
    await service.acknowledgeRevision(ctx, filmOne, deviceOne, pushResult.latestServerRevision);

    // 8. Pull operations
    const pullData = await service.pullOperations(ctx, filmOne, undefined, 50);
    assert.equal(pullData.kind, 'operations');
    assert.equal(pullData.operations.length, 1);
    assert.equal(pullData.operations[0]!.opId, op1.opId);

    await pool.end();
    // Test passed cleanly
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  console.error('❌ Sprint 10 Web Sync Center test suite failed:', err);
  process.exitCode = 1;
});
