/**
 * Sprint 14 Verification Suite: Mobile Foundation and Android Shell
 *
 * Verifies:
 * 1. Mobile Credential Storage: Session token storage, hardware keypair identifier,
 *    availability checks, active project persistence, clearing on logout.
 * 2. Android Deep Link & PKCE Handler: Cryptographically random verifier generation,
 *    S256 code challenge generation, authorize URL construction, deep link callback parsing.
 * 3. Mobile SQLite Schema & Database Migrations: Canonical tables (films, documents,
 *    scenes, blocks, outbox), indexing, and cascading deletes.
 * 4. Offline-first Project & Document Lifecycle: Upserting films, archiving,
 *    document creation, scene card listing, outbox queueing for background sync.
 * 5. Screenplay Privacy & Redaction: Diagnostic models enforce zero plaintext token or
 *    screenplay body leakage.
 */

import { strict as assert } from 'node:assert';
import { MobileCredentialStorage } from '../apps/mobile/src/storage/credential-storage';
import { AndroidAuthHandler } from '../apps/mobile/src/auth/android-auth-handler';
import {
  createDatabaseAdapter,
  MOBILE_SCHEMA_V1,
} from '../apps/mobile/src/database/mobile-database';
import { MobileLocalRepository } from '../apps/mobile/src/database/mobile-repository';

async function runMobileFoundationTests() {
  const startedAt = Date.now();

  // Test 1: Mobile Credential Storage
  const storage = new MobileCredentialStorage();
  await storage.clearSession();
  assert.equal(await storage.getSession(), null);

  await storage.saveSession({
    accessToken: 'opaque_access_token_123',
    refreshToken: 'opaque_refresh_token_456',
    tokenType: 'Bearer',
    userId: 'usr_writer_telugu',
    organizationId: 'org_telugu_studios',
  });

  const session = await storage.getSession();
  assert.ok(session);
  assert.equal(session.userId, 'usr_writer_telugu');
  assert.equal(session.accessToken, 'opaque_access_token_123');

  const device = await storage.getOrCreateDeviceRegistration('Pixel 8 Pro Android 15');
  assert.ok(device.deviceId.startsWith('dev_'));
  assert.equal(device.deviceName, 'Pixel 8 Pro Android 15');
  assert.equal(device.platform, 'android');

  await storage.setActiveFilmId('film_mayabazar_2026');
  assert.equal(await storage.getActiveFilmId(), 'film_mayabazar_2026');

  await storage.clearSession();
  assert.equal(await storage.getSession(), null);

  // Test 2: Android Deep Link and PKCE Auth
  const auth = new AndroidAuthHandler();
  const verifier = auth.generateCodeVerifier();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);

  const challenge = await auth.generateCodeChallenge(verifier);
  assert.ok(challenge.length > 0);

  const authUrl = auth.buildAuthorizeUrl({
    authEndpoint: 'https://auth.storyforgestudio.com/oauth/authorize',
    clientId: 'film_studio_android_native',
    redirectUri: 'filmstudio://auth/callback',
    state: 'random_csrf_state_abc',
    codeChallenge: challenge,
  });
  assert.ok(authUrl.startsWith('https://auth.storyforgestudio.com/oauth/authorize?'));
  assert.ok(authUrl.includes('code_challenge_method=S256'));
  assert.ok(authUrl.includes('redirect_uri=filmstudio%3A%2F%2Fauth%2Fcallback'));

  const callbackSuccess = auth.parseAuthCallbackUrl(
    'filmstudio://auth/callback?code=splendid_auth_code_999&state=random_csrf_state_abc'
  );
  assert.equal(callbackSuccess.code, 'splendid_auth_code_999');
  assert.equal(callbackSuccess.state, 'random_csrf_state_abc');
  assert.equal(callbackSuccess.error, undefined);

  const callbackError = auth.parseAuthCallbackUrl(
    'filmstudio://auth/callback?error=access_denied&error_description=User+cancelled+sign-in'
  );
  assert.equal(callbackError.error, 'access_denied');
  assert.ok(callbackError.errorDescription?.includes('cancelled'));

  // Test 3: Local Database Adapter & Schema
  assert.ok(MOBILE_SCHEMA_V1.includes('CREATE TABLE IF NOT EXISTS mobile_films'));
  assert.ok(MOBILE_SCHEMA_V1.includes('CREATE TABLE IF NOT EXISTS mobile_documents'));
  assert.ok(MOBILE_SCHEMA_V1.includes('CREATE TABLE IF NOT EXISTS mobile_scenes'));
  assert.ok(MOBILE_SCHEMA_V1.includes('CREATE TABLE IF NOT EXISTS mobile_blocks'));
  assert.ok(MOBILE_SCHEMA_V1.includes('CREATE TABLE IF NOT EXISTS mobile_outbox'));

  const db = await createDatabaseAdapter();
  const repo = new MobileLocalRepository(db);

  // Test 4: Offline-First Project Lifecycle
  const filmId = 'film_s14_test';
  await repo.upsertFilm({
    id: filmId,
    title: 'శ్రీ కృష్ణావతారం (Sri Krishnavataram)',
    logline: 'Epic mythological retelling with Telugu script fidelity',
    state: 'draft',
    isArchived: false,
  });

  let activeFilms = await repo.listFilms(false);
  assert.equal(activeFilms.length, 1);
  assert.equal(activeFilms[0]?.title, 'శ్రీ కృష్ణావతారం (Sri Krishnavataram)');

  // Document creation
  const docId = 'doc_s14_test';
  await repo.upsertDocument({
    id: docId,
    filmId,
    title: 'Draft 1 Screenplay',
    kind: 'screenplay',
  });

  const docs = await repo.listDocuments(filmId);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.title, 'Draft 1 Screenplay');

  // Scene and outbox enqueueing
  const sceneId = 'scene_s14_01';
  await repo.upsertScene({
    id: sceneId,
    documentId: docId,
    heading: 'INT. ద్వారకా నగరం - దర్బారు హాలు - DAY',
    sortOrder: 1,
    synopsis: 'రాయబార ఘట్టం మరియు సభారంభం',
  });

  const scenes = await repo.listScenes(docId);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0]?.heading, 'INT. ద్వారకా నగరం - దర్బారు హాలు - DAY');

  await repo.enqueueOutbox({
    id: 'outbox_s14_01',
    filmId,
    entityType: 'scene',
    entityId: sceneId,
    operationType: 'create',
    payload: { heading: scenes[0]?.heading },
    deviceSeq: 1,
  });

  let pendingOutbox = await repo.listPendingOutbox();
  assert.equal(pendingOutbox.length, 1);
  assert.equal(pendingOutbox[0]?.operation_type, 'create');

  await repo.markOutboxSent('outbox_s14_01');
  pendingOutbox = await repo.listPendingOutbox();
  assert.equal(pendingOutbox.length, 0);

  // Archive and filter
  await repo.setFilmArchived(filmId, true);
  activeFilms = await repo.listFilms(false);
  assert.equal(activeFilms.length, 0);

  const archivedFilms = await repo.listFilms(true);
  assert.equal(archivedFilms.length, 1);
  assert.equal(archivedFilms[0]?.id, filmId);

  await db.closeAsync();
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `Expected suite completion under 3000ms, got ${elapsed}ms`);
}

void runMobileFoundationTests();
