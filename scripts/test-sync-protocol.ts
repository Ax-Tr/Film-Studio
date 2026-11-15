import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresSyncRepository } from '../backend/src/database/postgres-sync.repository.js';
import { decodeSyncCursor, type ClientOperation } from '@film-studio/sync-core';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-aa7f-76a7-b2f1-38d5d2b6c577';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const documentOne = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const sceneOne = '018f4ce4-d16a-78b4-b2b1-85ec72e26323';
const sceneDeleted = '018f4ce4-d95a-72e3-884b-f190e7ce0d3d';
const deviceOne = '018f4ce4-f001-7000-8000-000000000001';
const deviceTwo = '018f4ce4-f002-7000-8000-000000000002';

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
        ('${userOne}', 'Sync User One', 'sync-one@example.test'),
        ('${userTwo}', 'Sync User Two', 'sync-two@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Sync Org One');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Sync Film One');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Sync Org Two');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Sync Film Two');

      -- Seed document and scene in Film One
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by, version)
      VALUES ('${documentOne}', '${filmOne}', 'Original Film Script', 'screenplay', 'te-IN', '${userOne}', 1);

      INSERT INTO scenes (id, film_id, document_id, version)
      VALUES
        ('${sceneOne}', '${filmOne}', '${documentOne}', 1),
        ('${sceneDeleted}', '${filmOne}', '${documentOne}', 1);

      UPDATE scenes SET deleted_at = now() WHERE id = '${sceneDeleted}';

      -- Add permission grants for testing
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

    const pool = new Pool({
      ...(createPgConfig(database) as unknown as Record<string, unknown>),
      max: 1,
    });

    try {
      await pool.query('SET ROLE app_sync_runtime');
      const repository = new PostgresSyncRepository(pool);

      // 1. Monotonic revision allocation & push valid document operation
      const op1: ClientOperation = {
        schemaVersion: 1,
        opId: '018f4ce4-aaaa-7000-8000-000000000001',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceOne,
        clientSequence: 1,
        entityType: 'document',
        entityId: documentOne,
        kind: 'document.metadata.patch',
        baseVersion: 1,
        payload: { title: 'Updated Screenplay Title' },
        createdAtClient: new Date().toISOString(),
      };

      const pushResult1 = await repository.pushOperations(userOne, filmOne, [op1]);
      if (pushResult1.results.length !== 1 || pushResult1.results[0]?.status !== 'applied') {
        throw new Error(`Push 1 failed: ${JSON.stringify(pushResult1)}`);
      }
      if (pushResult1.results[0].serverRevision !== 1 || pushResult1.latestServerRevision !== 1) {
        throw new Error(`Push 1 revision allocation mismatch: ${JSON.stringify(pushResult1)}`);
      }

      // 2. Idempotent retry: resending op1 returns already_applied
      const retryResult = await repository.pushOperations(userOne, filmOne, [op1]);
      if (retryResult.results[0]?.status !== 'already_applied') {
        throw new Error(`Expected already_applied on retry, got: ${JSON.stringify(retryResult)}`);
      }

      // 3. Device sequence reuse with different opId: rejected
      const seqReuseOp: ClientOperation = {
        schemaVersion: 1,
        opId: '018f4ce4-bbbb-7000-8000-000000000002',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceOne,
        clientSequence: 1, // Same sequence as op1 on deviceOne!
        entityType: 'document',
        entityId: documentOne,
        kind: 'document.metadata.patch',
        baseVersion: 2,
        payload: { title: 'Another title' },
        createdAtClient: new Date().toISOString(),
      };
      const seqReuseResult = await repository.pushOperations(userOne, filmOne, [seqReuseOp]);
      if (
        seqReuseResult.results[0]?.status !== 'rejected' ||
        seqReuseResult.results[0]?.errorCode !== 'DEVICE_SEQUENCE_REUSE'
      ) {
        throw new Error(`Expected DEVICE_SEQUENCE_REUSE, got: ${JSON.stringify(seqReuseResult)}`);
      }

      // 4. CRDT update on scene with binary payload
      const op2: ClientOperation = {
        schemaVersion: 1,
        opId: '018f4ce4-cccc-7000-8000-000000000003',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceOne,
        clientSequence: 2,
        entityType: 'scene',
        entityId: sceneOne,
        kind: 'scene.crdt.update',
        baseVersion: 1,
        payload: {
          updateBase64: Buffer.from([1, 2, 3, 4, 5]).toString('base64'),
        },
        createdAtClient: new Date().toISOString(),
      };
      const pushResult2 = await repository.pushOperations(userOne, filmOne, [op2]);
      if (
        pushResult2.results[0]?.status !== 'applied' ||
        pushResult2.results[0]?.serverRevision !== 2
      ) {
        throw new Error(`Push 2 CRDT update failed: ${JSON.stringify(pushResult2)}`);
      }

      // 5. Stale base with conflicting field -> SAME_FIELD_CHANGED conflict
      const op3Conflict: ClientOperation = {
        schemaVersion: 1,
        opId: '018f4ce4-dddd-7000-8000-000000000004',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceTwo,
        clientSequence: 1,
        entityType: 'document',
        entityId: documentOne,
        kind: 'document.metadata.patch',
        baseVersion: 1, // Stale! Document is now at version 2, and 'title' was changed
        payload: { title: 'Conflicting Offline Title' },
        createdAtClient: new Date().toISOString(),
      };
      const pushResult3 = await repository.pushOperations(userOne, filmOne, [op3Conflict]);
      if (
        pushResult3.results[0]?.status !== 'conflict' ||
        pushResult3.results[0]?.errorCode !== 'SAME_FIELD_CHANGED'
      ) {
        throw new Error(`Expected SAME_FIELD_CHANGED conflict, got: ${JSON.stringify(pushResult3)}`);
      }

      // 6. Delete vs Edit conflict on tombstoned scene
      const op4DeleteVsEdit: ClientOperation = {
        schemaVersion: 1,
        opId: '018f4ce4-eeee-7000-8000-000000000005',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceTwo,
        clientSequence: 2,
        entityType: 'scene',
        entityId: sceneDeleted,
        kind: 'scene.metadata.patch',
        baseVersion: 1,
        payload: { timeOfDay: 'NIGHT' },
        createdAtClient: new Date().toISOString(),
      };
      const pushResult4 = await repository.pushOperations(userOne, filmOne, [op4DeleteVsEdit]);
      if (
        pushResult4.results[0]?.status !== 'conflict' ||
        pushResult4.results[0]?.errorCode !== 'DELETE_VS_EDIT'
      ) {
        throw new Error(`Expected DELETE_VS_EDIT conflict, got: ${JSON.stringify(pushResult4)}`);
      }

      // 7. Future base version rejection
      const op5Future: ClientOperation = {
        schemaVersion: 1,
        opId: '018f4ce4-ffff-7000-8000-000000000006',
        filmId: filmOne,
        actorUserId: userOne,
        deviceId: deviceTwo,
        clientSequence: 3,
        entityType: 'document',
        entityId: documentOne,
        kind: 'document.metadata.patch',
        baseVersion: 999, // Future!
        payload: { title: 'Impossible Future' },
        createdAtClient: new Date().toISOString(),
      };
      const pushResult5 = await repository.pushOperations(userOne, filmOne, [op5Future]);
      if (
        pushResult5.results[0]?.status !== 'rejected' ||
        pushResult5.results[0]?.errorCode !== 'FUTURE_BASE_VERSION'
      ) {
        throw new Error(`Expected FUTURE_BASE_VERSION, got: ${JSON.stringify(pushResult5)}`);
      }

      // 8. Bounded pull and cursor progression
      const pull1 = await repository.pullOperations(userOne, filmOne, 0, 1);
      if (pull1.kind !== 'operations' || pull1.operations.length !== 1) {
        throw new Error(`Expected 1 operation on bounded pull, got ${pull1.operations.length}`);
      }
      if (!pull1.hasMore) {
        throw new Error('Expected hasMore=true for bounded limit');
      }
      const cursor1 = decodeSyncCursor(pull1.nextCursor);
      if (!cursor1 || cursor1.revision !== 1) {
        throw new Error(`Expected cursor revision 1, got ${cursor1?.revision}`);
      }

      const pull2 = await repository.pullOperations(userOne, filmOne, cursor1.revision, 10);
      if (pull2.kind !== 'operations' || pull2.operations.length !== 1) {
        throw new Error(`Expected 1 remaining operation, got ${pull2.operations.length}`);
      }
      if (pull2.hasMore) {
        throw new Error('Expected hasMore=false for final page');
      }

      // 9. Acknowledgement & Compaction floor safety
      await repository.acknowledgeRevision(userOne, filmOne, deviceOne, 2);
      await repository.acknowledgeRevision(userOne, filmOne, deviceTwo, 1);

      // Advance compaction floor to 1 (safe because min active device ack is 1)
      await repository.setCompactionFloor(userOne, filmOne, 1);

      // Attempting to advance compaction floor to 2 when deviceTwo ack is 1 must throw
      let compactionPrevented = false;
      try {
        await repository.setCompactionFloor(userOne, filmOne, 2);
      } catch (err) {
        if (err instanceof Error && err.message.includes('strand an active device')) {
          compactionPrevented = true;
        }
      }
      if (!compactionPrevented) {
        throw new Error('Compaction above active device ack was not prevented!');
      }

      // Pull with cursor (0) below compaction floor (1) returns snapshot_required
      const pullStale = await repository.pullOperations(userOne, filmOne, 0, 100);
      if (pullStale.kind !== 'snapshot_required') {
        throw new Error(`Expected snapshot_required for stale cursor below floor, got ${pullStale.kind}`);
      }

      // 10. Conflict listing and explicit resolution
      const conflicts = await repository.listConflicts(userOne, filmOne);
      if (conflicts.length < 2) {
        throw new Error(`Expected at least 2 recorded conflicts, found ${conflicts.length}`);
      }

      const conflictToResolve = conflicts.find((c) => c.conflictType === 'SAME_FIELD_CHANGED');
      if (!conflictToResolve) {
        throw new Error('Expected SAME_FIELD_CHANGED conflict in list');
      }
      const resolved = await repository.resolveConflict(
        userOne,
        filmOne,
        conflictToResolve.id,
        { choice: 'keep_remote' },
      );
      if (resolved.resolvedAt === undefined || resolved.resolutionStrategy !== 'keep_remote') {
        throw new Error(`Resolution failed: ${JSON.stringify(resolved)}`);
      }

      // 11. Cross-film tenant isolation
      let crossFilmBlocked = false;
      try {
        await repository.pullOperations(userTwo, filmOne, 0, 100);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          crossFilmBlocked = true;
        }
      }
      if (!crossFilmBlocked) {
        throw new Error('Tenant leak: userTwo was able to access filmOne!');
      }

      process.stdout.write(
        'Offline sync protocol verified: revision allocation, idempotency, sequence reuse, conflicts, delete vs edit, bounded pull, compaction floor, and tenant isolation.\n',
      );
    } finally {
      await pool.end();
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
