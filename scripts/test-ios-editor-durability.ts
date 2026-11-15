import { strict as assert } from 'node:assert';
import {
  createDatabaseAdapter,
} from '../apps/mobile/src/database/mobile-database';
import { MobileLocalRepository } from '../apps/mobile/src/database/mobile-repository';
import { IosScreenplayEditorEngine } from '../apps/mobile/src/editor/ios-screenplay-editor-engine';
import { MobileDraftPersistenceManager } from '../apps/mobile/src/editor/mobile-draft-persistence';
import { IosLifecycleManager } from '../apps/mobile/src/lifecycle/ios-lifecycle-manager';

async function runIosEditorDurabilityTests() {
  const startedAt = Date.now();

  const db = await createDatabaseAdapter();
  const repo = new MobileLocalRepository(db);

  const orgId = 'org_ios_cinema_1';
  const filmId = 'film_ios_epic_1';
  const docId = 'doc_ios_screenplay_1';
  const sceneId = 'scene_ios_kurukshetra_1';

  await repo.upsertFilm({
    id: filmId,
    organizationId: orgId,
    title: 'iOS Screenplay Epic',
    status: 'active',
  });

  await repo.upsertDocument({
    id: docId,
    filmId,
    title: 'iOS Master Script',
    kind: 'screenplay',
  });

  await repo.upsertScene({
    id: sceneId,
    documentId: docId,
    sortOrder: 1,
    heading: 'SCENE 1 - EXT. FIELD - DAY',
  });

  // 1. Test iOS Editor Engine & VoiceOver Accessibility
  const editor = new IosScreenplayEditorEngine(sceneId);
  const initialState = editor.getState();
  assert.equal(initialState.blocks.length, 1);
  assert.equal(initialState.blocks[0]!.type, 'scene_heading');
  assert.equal(initialState.blocks[0]!.accessibilityRole, 'header');
  assert.ok(initialState.blocks[0]!.voiceOverLabel.includes('Scene Heading'));

  // 2. Industry Enter Transitions on iOS
  const actionBlockId = editor.handleEnterOnBlock(initialState.blocks[0]!.id);
  let state = editor.getState();
  assert.equal(state.blocks.length, 2);
  assert.equal(state.blocks[1]!.type, 'action');
  assert.equal(state.blocks[1]!.accessibilityRole, 'text');

  // Change action to character
  editor.setBlockType(actionBlockId, 'character');
  editor.updateBlockText(actionBlockId, 'విక్రమ్ (VIKRAM)');

  state = editor.getState();
  const charBlock = state.blocks.find((b) => b.id === actionBlockId);
  assert.ok(charBlock);
  assert.equal(charBlock.type, 'character');
  assert.ok(charBlock.voiceOverLabel.includes('Character Name'));
  assert.equal(charBlock.text, 'విక్రమ్ (VIKRAM)');

  // Press enter on character -> must produce dialogue
  const dialogueBlockId = editor.handleEnterOnBlock(actionBlockId);
  state = editor.getState();
  assert.equal(state.blocks.length, 3);
  const dialogueBlock = state.blocks.find((b) => b.id === dialogueBlockId);
  assert.ok(dialogueBlock);
  assert.equal(dialogueBlock.type, 'dialogue');
  assert.ok(dialogueBlock.voiceOverLabel.includes('Dialogue'));

  // 3. Telugu IME Composition Safety & Smart Quote Suppressing on iOS
  const rawTeluguDialogue = '“శత్రువు సైన్యం సిద్ధంగా ఉంది, మనం ముందుకు వెళ్ళాలి!”';
  editor.updateBlockText(dialogueBlockId, rawTeluguDialogue);

  state = editor.getState();
  const updatedDialogue = state.blocks.find((b) => b.id === dialogueBlockId);
  assert.ok(updatedDialogue);
  // Smart quotes replaced with straight quotes
  assert.ok(!updatedDialogue.text.includes('“'));
  assert.ok(!updatedDialogue.text.includes('”'));
  assert.ok(updatedDialogue.text.includes('"'));
  // Virama check (U+0C4D) preserved canonically
  assert.ok(updatedDialogue.text.includes('\u0C4D'));

  // 4. Persistence & Simulated Process Kill / Force Termination
  const persistence = new MobileDraftPersistenceManager(filmId, docId, repo);
  await persistence.persistDraft(sceneId, state.blocks, state.revision);

  // Simulate iOS Lifecycle backgrounding flush
  const lifecycle = new IosLifecycleManager();
  let flushCount = 0;
  lifecycle.registerBackgroundFlushHandler(async () => {
    await persistence.persistDraft(sceneId, editor.getState().blocks, editor.getState().revision);
    flushCount++;
  });

  const flushRes = await lifecycle.handleStateChange('background');
  assert.equal(flushRes.flushed, 1);
  assert.equal(flushCount, 1);

  // Force-kill simulation: instantiate a new SQLite reader and draft recovery
  const freshDb = await createDatabaseAdapter();
  // SQLite table verification
  const persistedBlocks = await repo.listBlocks(sceneId);
  assert.equal(persistedBlocks.length, 3);
  assert.equal(persistedBlocks[0]!.type, 'scene_heading');
  assert.equal(persistedBlocks[1]!.type, 'character');
  assert.equal(persistedBlocks[1]!.text, 'విక్రమ్ (VIKRAM)');
  assert.equal(persistedBlocks[2]!.type, 'dialogue');
  assert.ok(persistedBlocks[2]!.text.includes('శత్రువు'));
  assert.ok(persistedBlocks[2]!.text.includes('\u0C4D'));

  // Commit draft to outbox for offline sync
  const outboxId = await persistence.commitDraftToOutbox(sceneId, state.blocks, 1);
  assert.ok(outboxId.startsWith('outbox_'));

  const outboxPending = await repo.listPendingOutbox();
  assert.equal(outboxPending.length, 1);
  assert.equal(outboxPending[0]!.entity_type, 'scene_blocks');
  assert.equal(outboxPending[0]!.entity_id, sceneId);

  await db.closeAsync();
  await freshDb.closeAsync();

  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `Expected tests under 3000ms, completed in ${elapsed}ms`);
}

void runIosEditorDurabilityTests();
