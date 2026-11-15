import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDatabaseAdapter,
} from '../apps/mobile/src/database/mobile-database';
import { MobileLocalRepository } from '../apps/mobile/src/database/mobile-repository';
import { IosKeychainStorage } from '../apps/mobile/src/storage/ios-keychain-storage';
import { IosAuthHandler } from '../apps/mobile/src/auth/ios-auth-handler';
import { IosScreenplayEditorEngine } from '../apps/mobile/src/editor/ios-screenplay-editor-engine';
import { MobileDraftPersistenceManager } from '../apps/mobile/src/editor/mobile-draft-persistence';
import {
  MobileSyncCoordinator,
  type RemoteSyncClient,
} from '../apps/mobile/src/sync/mobile-sync-coordinator';
import { IosExportShareService } from '../apps/mobile/src/export/ios-export-share-service';
import { IosDiagnosticsService } from '../apps/mobile/src/diagnostics/ios-diagnostics-service';
import { IosLifecycleManager } from '../apps/mobile/src/lifecycle/ios-lifecycle-manager';
import type { SyncPushResult } from '@film-studio/sync-core';

async function runIosReleaseCandidateTests() {
  const startedAt = Date.now();

  // 1. Validate iOS Release Manifest and app.json Configuration
  const appJsonPath = resolve(process.cwd(), 'apps/mobile/app.json');
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.storyforgestudio.mobile');
  assert.equal(appJson.expo.scheme, 'filmstudio');
  assert.ok(appJson.expo.ios.infoPlist.NSFaceIDUsageDescription);
  assert.ok(appJson.expo.ios.infoPlist.UIBackgroundModes.includes('fetch'));

  const manifestPath = resolve(process.cwd(), 'docs/release/IOS_RELEASE_MANIFEST_G4.md');
  const manifestContent = readFileSync(manifestPath, 'utf-8');
  assert.ok(manifestContent.includes('IOS RELEASE MANIFEST — GATE G4'));
  assert.ok(manifestContent.includes('Dynamic Island'));
  assert.ok(manifestContent.includes('Apple Secure Enclave'));
  assert.ok(manifestContent.includes('VoiceOver'));

  // 2. iOS Keychain & OIDC Authentication
  const keychain = new IosKeychainStorage();
  const device = await keychain.getOrCreateDeviceRegistration('iPhone 16 Pro Max');
  assert.equal(device.platform, 'ios');
  assert.ok(device.secureEnclaveBacked);

  await keychain.saveSession({
    accessToken: 'test_ios_token_g4',
    refreshToken: 'test_ios_refresh_g4',
    tokenType: 'Bearer',
    userId: 'user_director_ios_g4',
    organizationId: 'org_telugu_cinema_g4',
  });
  const session = await keychain.getSession();
  assert.equal(session?.userId, 'user_director_ios_g4');

  const auth = new IosAuthHandler();
  const verifier = auth.generateCodeVerifier();
  const challenge = await auth.generateCodeChallenge(verifier);
  const authorizeUrl = auth.buildAuthorizeUrl({
    authEndpoint: 'https://auth.storyforge.studio/oauth/authorize',
    clientId: 'storyforge_ios',
    redirectUri: 'filmstudio://auth/callback',
    state: 'csrf_nonce_g4',
    codeChallenge: challenge,
  });
  assert.ok(authorizeUrl.includes('code_challenge_method=S256'));

  // 3. Local Durability, VoiceOver & Telugu Typography
  const db = await createDatabaseAdapter();
  const repo = new MobileLocalRepository(db);

  const filmId = 'film_ios_g4_rc';
  const docId = 'doc_ios_g4_rc';
  const sceneId = 'scene_ios_g4_rc';

  await repo.upsertFilm({
    id: filmId,
    organizationId: 'org_telugu_cinema_g4',
    title: 'ఆర్ఆర్ఆర్ 2 (RRR 2)',
    status: 'active',
  });

  await repo.upsertDocument({
    id: docId,
    filmId,
    title: 'RRR 2 Script',
    kind: 'screenplay',
  });

  await repo.upsertScene({
    id: sceneId,
    documentId: docId,
    sortOrder: 1,
    heading: 'EXT. అటవీ ప్రాంతం - ఉదయం - DAY',
  });

  const editor = new IosScreenplayEditorEngine(sceneId);
  const headingId = editor.getState().blocks[0]!.id;
  const actionId = editor.handleEnterOnBlock(headingId);
  editor.setBlockType(actionId, 'character');
  editor.updateBlockText(actionId, 'కొమరం భీమ్ (KOMARAM BHEEM)');

  const dialogueId = editor.handleEnterOnBlock(actionId);
  editor.updateBlockText(dialogueId, '“ఈ పోరాటం ఆగదు... మన గడ్డ మనదే!”');

  const editorState = editor.getState();
  assert.equal(editorState.blocks.length, 3);
  assert.equal(editorState.blocks[0]!.accessibilityRole, 'header');
  assert.equal(editorState.blocks[2]!.accessibilityRole, 'text');
  // Telugu viramas and straight quote conversion
  assert.ok(editorState.blocks[2]!.text.includes('\u0C4D'));
  assert.ok(editorState.blocks[2]!.text.includes('"'));

  // Background persistence and process termination simulation
  const persistence = new MobileDraftPersistenceManager(filmId, docId, repo);
  const lifecycle = new IosLifecycleManager();
  lifecycle.registerBackgroundFlushHandler(async () => {
    await persistence.persistDraft(sceneId, editor.getState().blocks, editor.getState().revision);
  });
  const flushRes = await lifecycle.handleStateChange('background');
  assert.equal(flushRes.flushed, 1);

  const restoredBlocks = await repo.listBlocks(sceneId);
  assert.equal(restoredBlocks.length, 3);
  assert.equal(restoredBlocks[1]!.text, 'కొమరం భీమ్ (KOMARAM BHEEM)');

  // 4. Offline Sync & Conflict Resolution
  await persistence.commitDraftToOutbox(sceneId, editorState.blocks, 1);
  const pendingOutbox = await repo.listPendingOutbox();
  assert.equal(pendingOutbox.length, 1);

  const mockRemote: RemoteSyncClient = {
    async pushOperations(_fId, ops) {
      return ops.map((op) => ({
        opId: op.opId,
        status: 'applied' as SyncPushResult['status'],
        serverRevision: 88,
      }));
    },
    async pullOperations() {
      return {
        serverRevision: 88,
        operations: [],
      };
    },
  };

  const syncCoordinator = new MobileSyncCoordinator(filmId, repo, mockRemote);
  const syncSummary = await syncCoordinator.synchronize();
  assert.equal(syncSummary.pushedCount, 1);
  const pendingAfter = await repo.listPendingOutbox();
  assert.equal(pendingAfter.length, 0);

  // 5. iOS Share Sheet & AirDrop Exports
  const shareService = new IosExportShareService(repo);
  const pdfShare = await shareService.prepareIosPdfShare('RRR 2', docId, {
    watermark: 'CONFIDENTIAL iOS CANDIDATE',
  });
  assert.equal(pdfShare.mimeType, 'application/pdf');
  assert.equal(pdfShare.uti, 'com.adobe.pdf');
  assert.ok(pdfShare.sizeBytes > 200);

  const fountainShare = await shareService.prepareIosFountainShare('RRR 2', docId);
  assert.equal(fountainShare.uti, 'public.utf8-plain-text');
  const fountainText = Buffer.from(fountainShare.contentData).toString('utf-8');
  assert.ok(fountainText.includes('Title: RRR 2'));
  assert.ok(fountainText.includes('కొమరం భీమ్ (KOMARAM BHEEM)'));

  // 6. Diagnostics & Privacy Protection
  const diagnostics = new IosDiagnosticsService();
  const report = await diagnostics.generateReport();
  assert.equal(report.platform, 'ios');
  assert.equal(report.bundleId, 'com.storyforgestudio.mobile');

  const redacted = diagnostics.redactString('Token Bearer confidential_jwt_token_123');
  assert.ok(!redacted.includes('confidential_jwt_token_123'));

  await db.closeAsync();

  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `Expected suite under 3000ms, completed in ${elapsed}ms`);
}

void runIosReleaseCandidateTests();

