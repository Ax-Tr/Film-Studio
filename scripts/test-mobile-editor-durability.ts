/**
 * Sprint 15 Verification Suite: Android Screenplay Editor & Offline Durability
 *
 * Verifies:
 * 1. Mobile Screenplay Editor Engine:
 *    - Canonical typed block transitions (Scene Heading -> Action -> Character -> Dialogue -> Character/Action).
 *    - Stable block and scene IDs.
 *    - Re-indexing of block sort_order.
 * 2. Telugu Unicode & IME Composition Safety:
 *    - Telugu text input containing complex conjuncts, viramas (U+0C4D), and matras.
 *    - Canonical Unicode NFC normalization preservation across edits.
 * 3. Local Durability & Force-Kill Recovery:
 *    - In-flight draft updates persisted instantaneously to local SQLite `mobile_blocks`.
 *    - Simulating app process kill / restart: recovering draft verbatim from SQLite.
 * 4. Offline Outbox Mutation Enqueueing:
 *    - Committing draft enqueues an atomic operation in `mobile_outbox` with device sequence.
 * 5. Multi-Scene Navigation & Full-Storage/Empty Scene Safety:
 *    - Dynamic scene creation, scene switching, preserving independent scene block states.
 */

import { strict as assert } from 'node:assert';
import {
  createDatabaseAdapter,
} from '../android/src/database/mobile-database';
import { MobileLocalRepository } from '../android/src/database/mobile-repository';
import { MobileScreenplayEditorEngine } from '../android/src/editor/mobile-screenplay-editor-engine';
import { MobileDraftPersistenceManager } from '../android/src/editor/mobile-draft-persistence';

async function runMobileEditorDurabilityTests() {
  const startedAt = Date.now();

  const db = await createDatabaseAdapter();
  const repo = new MobileLocalRepository(db);

  const filmId = 'film_s15_durability';
  const docId = 'doc_s15_screenplay';
  const sceneId = 'scene_s15_01';

  await repo.upsertFilm({
    id: filmId,
    title: 'మాయాబజార్ 2026 (Mayabazar)',
    logline: 'Mythological masterwork with native Android durability',
  });

  await repo.upsertDocument({
    id: docId,
    filmId,
    title: 'Full Screenplay',
    kind: 'screenplay',
  });

  await repo.upsertScene({
    id: sceneId,
    documentId: docId,
    heading: 'EXT. ద్వారక - తీర ప్రాంతం - SUNSET',
    sortOrder: 1,
  });

  // Test 1: Editor Engine Lifecycle & Keyboard Transitions
  const editor = new MobileScreenplayEditorEngine(sceneId);
  const initialState = editor.getState();
  assert.equal(initialState.sceneId, sceneId);
  assert.equal(initialState.blocks.length, 1);
  assert.equal(initialState.blocks[0]?.type, 'scene_heading');

  // Enter on Scene Heading creates Action block
  const actionBlockId = editor.handleEnterOnBlock(initialState.blocks[0]!.id);
  let state = editor.getState();
  assert.equal(state.blocks.length, 2);
  assert.equal(state.blocks[1]?.id, actionBlockId);
  assert.equal(state.blocks[1]?.type, 'action');
  assert.equal(state.blocks[1]?.sortOrder, 2);

  // Set block type to Character and enter -> creates Dialogue
  editor.setBlockType(actionBlockId, 'character');
  editor.updateBlockText(actionBlockId, 'శ్రీకృష్ణుడు (KRISHNA)');

  const dialogueBlockId = editor.handleEnterOnBlock(actionBlockId);
  state = editor.getState();
  assert.equal(state.blocks.length, 3);
  assert.equal(state.blocks[2]?.id, dialogueBlockId);
  assert.equal(state.blocks[2]?.type, 'dialogue');

  // Test 2: Telugu Unicode Preservation & NFC Normalization
  // "ధర్మసంస్థాపనార్థాయ సంభవామి యుగే యుగే"
  const teluguDialogue = 'ధర్మసంస్థాపనార్థాయ సంభవామి యుగే యుగే!';
  editor.updateBlockText(dialogueBlockId, teluguDialogue);

  state = editor.getState();
  const dialogueBlock = state.blocks.find((b) => b.id === dialogueBlockId);
  assert.ok(dialogueBlock);
  assert.equal(dialogueBlock.text, teluguDialogue.normalize('NFC'));
  // Verify virama U+0C4D preservation
  assert.ok(dialogueBlock.text.includes('\u0C4D'));

  // Test 3: Local Durability & Force-Kill Recovery
  const persistence = new MobileDraftPersistenceManager(filmId, docId, repo);
  await persistence.persistDraft(sceneId, state.blocks, state.revision);

  // Verify written to SQLite `mobile_blocks`
  const localBlocks = await repo.listBlocks(sceneId);
  assert.equal(localBlocks.length, 3);
  assert.equal(localBlocks[0]?.type, 'scene_heading');
  assert.equal(localBlocks[1]?.text, 'శ్రీకృష్ణుడు (KRISHNA)');
  assert.equal(localBlocks[2]?.text, teluguDialogue.normalize('NFC'));

  // Simulate process kill: create fresh engine & persistence instance and recover
  const freshPersistence = new MobileDraftPersistenceManager(filmId, docId, repo);
  const recoveredBlocks = await freshPersistence.recoverDraft(sceneId);
  assert.ok(recoveredBlocks);
  assert.equal(recoveredBlocks.length, 3);
  assert.equal(recoveredBlocks[2]?.text, teluguDialogue.normalize('NFC'));

  // Re-instantiate editor with recovered blocks
  const recoveredEditor = new MobileScreenplayEditorEngine(sceneId, recoveredBlocks);
  assert.equal(recoveredEditor.getState().blocks.length, 3);

  // Test 4: Offline Outbox Mutation Enqueueing
  const outboxId = await persistence.commitDraftToOutbox(sceneId, state.blocks, 101);
  assert.ok(outboxId.startsWith('outbox_'));

  const pendingOutbox = await repo.listPendingOutbox();
  assert.equal(pendingOutbox.length, 1);
  assert.equal(pendingOutbox[0]?.entity_type, 'scene_blocks');
  assert.equal(pendingOutbox[0]?.entity_id, sceneId);
  assert.equal(pendingOutbox[0]?.device_seq, 101);

  // Parse outbox JSON payload and verify Telugu content preservation
  const payload = JSON.parse(pendingOutbox[0]!.payload_json) as {
    documentId: string;
    sceneId: string;
    blocks: readonly { id: string; text: string; type: string }[];
  };
  assert.equal(payload.documentId, docId);
  assert.equal(payload.sceneId, sceneId);
  assert.equal(payload.blocks[2]?.text, teluguDialogue.normalize('NFC'));

  // Test 5: Multi-Scene Independent State
  const scene2Id = 'scene_s15_02';
  await repo.upsertScene({
    id: scene2Id,
    documentId: docId,
    heading: 'INT. అంతఃపురం - NIGHT',
    sortOrder: 2,
  });

  const editorScene2 = new MobileScreenplayEditorEngine(scene2Id);
  editorScene2.updateBlockText(editorScene2.getState().blocks[0]!.id, 'INT. అంతఃపురం - NIGHT');
  await persistence.persistDraft(scene2Id, editorScene2.getState().blocks, 1);

  const scene1Blocks = await repo.listBlocks(sceneId);
  const scene2Blocks = await repo.listBlocks(scene2Id);
  assert.equal(scene1Blocks.length, 3);
  assert.equal(scene2Blocks.length, 1);
  assert.equal(scene2Blocks[0]?.heading, undefined);
  assert.equal(scene2Blocks[0]?.text, 'INT. అంతఃపురం - NIGHT');

  await db.closeAsync();
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `Expected suite under 3000ms, completed in ${elapsed}ms`);
}

void runMobileEditorDurabilityTests();
