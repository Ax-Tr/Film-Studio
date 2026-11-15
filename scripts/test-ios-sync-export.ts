import { strict as assert } from 'node:assert';
import {
  createDatabaseAdapter,
} from '../apps/mobile/src/database/mobile-database';
import { MobileLocalRepository } from '../apps/mobile/src/database/mobile-repository';
import {
  MobileSyncCoordinator,
  type RemoteSyncClient,
} from '../apps/mobile/src/sync/mobile-sync-coordinator';
import { IosExportShareService } from '../apps/mobile/src/export/ios-export-share-service';
import type { SyncPushResult } from '@film-studio/sync-core';

async function runIosSyncAndExportTests() {
  const startedAt = Date.now();

  const db = await createDatabaseAdapter();
  const repo = new MobileLocalRepository(db);

  const orgId = 'org_ios_cinema_sync';
  const filmId = 'film_ios_sync_1';
  const docId = 'doc_ios_sync_screenplay';
  const sceneId = 'scene_ios_sync_01';

  await repo.upsertFilm({
    id: filmId,
    organizationId: orgId,
    title: 'iOS Sync Master Epic',
    status: 'active',
  });

  await repo.upsertDocument({
    id: docId,
    filmId,
    title: 'iOS Screenplay Draft',
    kind: 'screenplay',
  });

  await repo.upsertScene({
    id: sceneId,
    documentId: docId,
    sortOrder: 1,
    heading: 'INT. PRODUCTION OFFICE - DAY',
  });

  await repo.upsertBlocks(sceneId, [
    {
      id: 'blk_ios_1',
      sortOrder: 1,
      type: 'scene_heading',
      text: 'INT. PRODUCTION OFFICE - DAY',
    },
    {
      id: 'blk_ios_2',
      sortOrder: 2,
      type: 'character',
      text: 'రాజమౌళి (DIRECTOR)',
    },
    {
      id: 'blk_ios_3',
      sortOrder: 3,
      type: 'dialogue',
      text: 'ఈ సన్నివేశంలో ఉద్వేగం స్పష్టంగా కనిపించాలి.',
    },
  ]);

  // 1. Enqueue outbox mutations for iOS sync
  await repo.enqueueOutbox({
    id: 'outbox_ios_mut_1',
    filmId,
    entityType: 'scene_blocks',
    entityId: sceneId,
    operationType: 'UPDATE',
    payload: { sceneId, blockCount: 3 },
    deviceSeq: 1,
  });

  // Verify initial state
  const initialPending = await repo.listPendingOutbox();
  assert.equal(initialPending.length, 1);

  // 2. Mock RemoteSyncClient for iOS Sync Coordinator
  const pushedOps: Array<{ opId: string; entityId: string }> = [];
  const mockRemote: RemoteSyncClient = {
    async pushOperations(fId, ops) {
      assert.equal(fId, filmId);
      return ops.map((op) => {
        pushedOps.push({ opId: op.opId, entityId: op.entityId });
        return {
          opId: op.opId,
          status: 'applied' as SyncPushResult['status'],
          serverRevision: 75,
        };
      });
    },

    async pullOperations(fId, sinceRev) {
      assert.equal(fId, filmId);
      assert.equal(sinceRev, 0);
      return {
        serverRevision: 75,
        operations: [
          {
            opId: 'remote_op_web_1',
            entityType: 'scene_blocks',
            entityId: sceneId,
            serverRevision: 74,
            payload: {
              heading: 'INT. PRODUCTION OFFICE - NIGHT',
              note: 'Web collaborator updated lighting',
            },
          },
        ],
      };
    },
  };

  const coordinator = new MobileSyncCoordinator(filmId, repo, mockRemote);
  const syncSummary = await coordinator.synchronize();

  assert.equal(syncSummary.pushedCount, 1);
  assert.equal(syncSummary.pulledCount, 1);
  assert.equal(syncSummary.conflictCount, 1); // SAME_FIELD_CHANGED detected because local outbox had modifications for scene_blocks

  const syncState = await coordinator.getSyncState();
  assert.equal(syncState.lastServerRevision, 75);

  const pendingAfterSync = await repo.listPendingOutbox();
  assert.equal(pendingAfterSync.length, 0, 'Outbox must be flushed after successful push');

  // 3. Conflict inspection and resolution
  const conflicts = await repo.listConflicts(filmId);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.conflict_type, 'SAME_FIELD_CHANGED');
  assert.equal(conflicts[0]!.resolution_status, 'unresolved');

  // Resolve conflict: keep local
  await coordinator.resolveConflict(conflicts[0]!.id, 'keep_local');
  const postResolveConflicts = await repo.listConflicts(filmId);
  assert.equal(postResolveConflicts[0]!.resolution_status, 'resolved');

  // 4. iOS PDF & Fountain AirDrop/Files Export Service
  const shareService = new IosExportShareService(repo);

  // PDF AirDrop share
  const pdfShare = await shareService.prepareIosPdfShare('బాహుబలి - ది బిగినింగ్', docId, {
    watermark: 'CONFIDENTIAL iOS PREVIEW',
    author: 'ఎస్.ఎస్.రాజమౌళి',
  });
  assert.equal(pdfShare.mimeType, 'application/pdf');
  assert.equal(pdfShare.uti, 'com.adobe.pdf');
  assert.ok(pdfShare.sizeBytes > 200);
  assert.ok(pdfShare.shareTitle.includes('PDF'));

  // Fountain AirDrop share
  const fountainShare = await shareService.prepareIosFountainShare('బాహుబలి - ది బిగినింగ్', docId);
  assert.equal(fountainShare.mimeType, 'text/plain');
  assert.equal(fountainShare.uti, 'public.utf8-plain-text');
  const textContent = Buffer.from(fountainShare.contentData).toString('utf-8');
  assert.ok(textContent.includes('Title: బాహుబలి - ది బిగినింగ్'));
  assert.ok(textContent.includes('INT. PRODUCTION OFFICE - DAY'));
  assert.ok(textContent.includes('రాజమౌళి (DIRECTOR)'));
  assert.ok(textContent.includes('ఈ సన్నివేశంలో ఉద్వేగం స్పష్టంగా కనిపించాలి.'));

  await db.closeAsync();

  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `Expected suite under 3000ms, completed in ${elapsed}ms`);
}

void runIosSyncAndExportTests();
