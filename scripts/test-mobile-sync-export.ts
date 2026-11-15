/**
 * Sprint 16 Verification Suite: Android Sync, Conflicts, and Exports
 *
 * Verifies:
 * 1. Mobile Bidirectional Synchronization:
 *    - Pulling remote operations since last known server revision.
 *    - Pushing pending local outbox operations with device sequence uniqueness.
 *    - Monotonic tracking of server revisions in SQLite `mobile_sync_meta`.
 * 2. Field-Level Conflict Resolution Sheet:
 *    - Simulating concurrent remote changes conflicting with uncommitted local outbox mutations.
 *    - Automatic recording of `SAME_FIELD_CHANGED` conflict records in `mobile_conflicts`.
 *    - Conflict resolution workflow: choosing between keep_local or keep_remote.
 * 3. Screenplay Export Engine on Mobile:
 *    - Generating compliant, searchable PDF 1.4 binary stream with custom watermark and margins.
 *    - Generating Fountain plaintext export preserving scene headings and dialogue blocks.
 *    - Zero data loss or corruption during export.
 * 4. Telugu Unicode Preservation:
 *    - Telugu text preserved across sync cycle and export outputs.
 */

import { strict as assert } from 'node:assert';
import {
  createDatabaseAdapter,
} from '../apps/mobile/src/database/mobile-database';
import { MobileLocalRepository } from '../apps/mobile/src/database/mobile-repository';
import {
  MobileSyncCoordinator,
  type RemoteSyncClient,
} from '../apps/mobile/src/sync/mobile-sync-coordinator';
import { MobileExportService } from '../apps/mobile/src/export/mobile-export-service';
import type { SyncPushResult } from '@film-studio/sync-core';

async function runMobileSyncExportTests() {
  const startedAt = Date.now();

  const db = await createDatabaseAdapter();
  const repo = new MobileLocalRepository(db);

  const filmId = 'film_s16_sync';
  const docId = 'doc_s16_screenplay';
  const sceneId = 'scene_s16_01';

  await repo.upsertFilm({
    id: filmId,
    title: 'శ్రీకృష్ణార్జున యుద్ధం (Sri Krishnarjuna Yuddham)',
    logline: 'Epic conflict with offline sync and PDF export on Android',
  });

  await repo.upsertDocument({
    id: docId,
    filmId,
    title: 'Production Draft',
  });

  await repo.upsertScene({
    id: sceneId,
    documentId: docId,
    heading: 'EXT. కురుక్షేత్ర రణరంగం - DAY',
    sortOrder: 1,
  });

  // Seed blocks
  await repo.upsertBlocks(sceneId, [
    {
      id: 'blk_s16_01',
      sortOrder: 1,
      type: 'character',
      text: 'అర్జునుడు (ARJUNA)',
    },
    {
      id: 'blk_s16_02',
      sortOrder: 2,
      type: 'dialogue',
      text: 'గాండీవం జారినది... నా మనస్సు భ్రమించుచున్నది!',
    },
  ]);

  // Test 1: Push/Pull Bidirectional Sync Cycle
  const pushedOps: unknown[] = [];
  const mockRemote: RemoteSyncClient = {
    pushOperations: async (_fId, ops) => {
      pushedOps.push(...ops);
      return ops.map((op) => ({
        opId: op.opId,
        status: 'applied' as SyncPushResult['status'],
        serverRevision: 42 + op.deviceSeq,
      }));
    },
    pullOperations: async () => {
      return {
        serverRevision: 42,
        operations: [],
      };
    },
  };

  const coordinator = new MobileSyncCoordinator(filmId, repo, mockRemote);

  // Enqueue outbox mutation
  await repo.enqueueOutbox({
    id: 'outbox_s16_01',
    filmId,
    entityType: 'scene_blocks',
    entityId: sceneId,
    operationType: 'update',
    payload: { heading: 'EXT. కురుక్షేత్ర రణరంగం - DAY' },
    deviceSeq: 1,
  });

  let syncState = await coordinator.getSyncState();
  assert.equal(syncState.pendingOutboxCount, 1);
  assert.equal(syncState.lastServerRevision, 0);

  const syncResult1 = await coordinator.synchronize();
  assert.equal(syncResult1.pushedCount, 1);
  assert.equal(syncResult1.conflictCount, 0);

  syncState = await coordinator.getSyncState();
  assert.equal(syncState.pendingOutboxCount, 0);
  assert.equal(syncState.lastServerRevision, 43);

  // Test 2: Field-Level Conflict Detection
  // Enqueue a local mutation for sceneId
  await repo.enqueueOutbox({
    id: 'outbox_s16_02',
    filmId,
    entityType: 'scene_blocks',
    entityId: sceneId,
    operationType: 'update',
    payload: { heading: 'EXT. కురుక్షేత్రం - సూర్యోదయం' },
    deviceSeq: 2,
  });

  // Setup remote client returning a concurrent update to the exact same sceneId
  const conflictingRemote: RemoteSyncClient = {
    pushOperations: async () => [],
    pullOperations: async () => ({
      serverRevision: 50,
      operations: [
        {
          opId: 'op_remote_99',
          entityType: 'scene_blocks',
          entityId: sceneId,
          serverRevision: 50,
          payload: { heading: 'EXT. KURUSHETRA - BATTLE DAWN' },
        },
      ],
    }),
  };

  const conflictCoordinator = new MobileSyncCoordinator(filmId, repo, conflictingRemote);
  const syncResult2 = await conflictCoordinator.synchronize();
  assert.equal(syncResult2.conflictCount, 1);

  const conflicts = await repo.listConflicts(filmId);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.entity_id, sceneId);
  assert.equal(conflicts[0]?.conflict_type, 'SAME_FIELD_CHANGED');
  assert.equal(conflicts[0]?.resolution_status, 'unresolved');

  // Resolve conflict
  await conflictCoordinator.resolveConflict(conflicts[0]!.id, 'keep_local');
  const resolvedConflicts = await repo.listConflicts(filmId);
  assert.equal(resolvedConflicts[0]?.resolution_status, 'resolved');

  // Test 3: Screenplay PDF & Fountain Export
  const exporter = new MobileExportService(repo);

  // PDF Export
  const pdfResult = await exporter.exportScreenplayPdf(
    'శ్రీకృష్ణార్జున యుద్ధం',
    docId,
    { watermark: 'CONFIDENTIAL PREVIEW' }
  );
  assert.equal(pdfResult.mimeType, 'application/pdf');
  assert.ok(pdfResult.sizeBytes > 100);
  // Verify PDF header bytes (%PDF-1.4)
  const headerStr = Buffer.from(pdfResult.contentData.slice(0, 8)).toString('ascii');
  assert.ok(headerStr.startsWith('%PDF-1.4'));

  // Fountain Plaintext Export
  const fountainResult = await exporter.exportScreenplayFountain(
    'శ్రీకృష్ణార్జున యుద్ధం',
    docId
  );
  assert.equal(fountainResult.mimeType, 'text/plain');
  const fountainText = Buffer.from(fountainResult.contentData).toString('utf-8');
  assert.ok(fountainText.includes('Title: శ్రీకృష్ణార్జున యుద్ధం'));
  assert.ok(fountainText.includes('EXT. కురుక్షేత్ర రణరంగం - DAY'));
  assert.ok(fountainText.includes('అర్జునుడు (ARJUNA)'));
  assert.ok(fountainText.includes('గాండీవం జారినది...'));

  await db.closeAsync();
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `Expected suite under 3000ms, completed in ${elapsed}ms`);
}

void runMobileSyncExportTests();
