import { screenplayDocumentSchema } from '@film-studio/screenplay-model';
import {
  CompositionTracker,
  computeVirtualSlice,
  createBlockId,
  createScreenplayExtensions,
  extractSceneNavigation,
  getNextBlockTypeOnEnter,
  getNextBlockTypeOnTab,
  LocalTransactionalSaveAdapter,
  nodeNameByType,
  screenplayBlockTypes,
  verifyTeluguRoundtrip,
  type ScreenplayBlockJson,
} from '../packages/editor-bridge/src/index.js';

async function main(): Promise<void> {
  // 1. Golden Typed-Block Schema & Node Extensions
  const extensions = createScreenplayExtensions();
  if (extensions.length !== 20) {
    throw new Error(`Expected 20 extensions (doc + text + 18 blocks), got ${extensions.length}`);
  }

  const registeredNodeNames = new Set(extensions.map((ext) => ext.name));
  for (const blockType of screenplayBlockTypes) {
    const nodeName = nodeNameByType[blockType];
    if (!registeredNodeNames.has(nodeName)) {
      throw new Error(`Missing registered node for block type: ${blockType}`);
    }
  }

  const testId1 = createBlockId();
  const testId2 = createBlockId();
  if (testId1 === testId2 || !testId1.includes('-')) {
    throw new Error('Block ID generator failed UUID uniqueness assertion.');
  }

  // 2. Screenplay Keyboard Transitions
  if (getNextBlockTypeOnEnter('scene_heading', false) !== 'action') {
    throw new Error('Transition scene_heading -> action on Enter failed.');
  }
  if (getNextBlockTypeOnTab('action', false) !== 'character_cue') {
    throw new Error('Transition action -> character_cue on Tab failed.');
  }
  if (getNextBlockTypeOnEnter('character_cue', false) !== 'dialogue') {
    throw new Error('Transition character_cue -> dialogue on Enter failed.');
  }
  if (getNextBlockTypeOnTab('dialogue', false) !== 'parenthetical') {
    throw new Error('Transition dialogue -> parenthetical on Tab failed.');
  }
  if (getNextBlockTypeOnEnter('parenthetical', false) !== 'dialogue') {
    throw new Error('Transition parenthetical -> dialogue on Enter failed.');
  }
  if (getNextBlockTypeOnEnter('transition', false) !== 'scene_heading') {
    throw new Error('Transition transition -> scene_heading on Enter failed.');
  }

  // 3. Telugu IME Composition Safety & Roundtrip
  const tracker = new CompositionTracker();
  let compState = false;
  const mockTarget = {
    addEventListener: (_type: string, listener: (e: unknown) => void) => {
      if (_type === 'compositionstart') compState = true;
      if (_type === 'compositionend') compState = false;
      listener(new Event(_type));
    },
    removeEventListener: () => {},
  };
  tracker.attach(mockTarget);
  if (!compState && tracker.isComposing) {
    throw new Error('Composition tracker state mismatch.');
  }

  const teluguGolden = 'INT. రవి ఇల్లు — రాత్రి. బయట వర్షం పడుతోంది. నేను రేపు వస్తాను — తప్పకుండా!';
  if (!verifyTeluguRoundtrip(teluguGolden, teluguGolden)) {
    throw new Error('Telugu golden text roundtrip validation failed.');
  }
  const corruptTelugu = teluguGolden.replace(/\u0C4D/g, '');
  if (verifyTeluguRoundtrip(teluguGolden, corruptTelugu)) {
    throw new Error('Corrupted Telugu text with dropped viramas erroneously passed roundtrip.');
  }

  // 4. Crash Recovery & Transactional Save Adapter
  const documentId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
  const adapter = new LocalTransactionalSaveAdapter(documentId);

  const block1Id = createBlockId();
  const block2Id = createBlockId();
  const testBlocks: ScreenplayBlockJson[] = [
    {
      type: 'sceneHeading',
      attrs: {
        blockId: block1Id,
        blockType: 'scene_heading',
        sceneId: block1Id,
        sceneNumber: 1,
      },
      content: [{ type: 'text', text: 'INT. రవి ఇల్లు — రాత్రి' }],
    },
    {
      type: 'action',
      attrs: {
        blockId: block2Id,
        blockType: 'action',
      },
      content: [{ type: 'text', text: 'బయట వర్షం పడుతోంది.' }],
    },
  ];

  adapter.saveDraft(testBlocks, 1);
  if (!adapter.hasUnsavedChanges()) {
    throw new Error('Adapter failed to track unsaved changes.');
  }

  // Simulate crash / restart: instantiate new adapter on same documentId
  const recoveredAdapter = new LocalTransactionalSaveAdapter(documentId);
  const recoveredDraft = recoveredAdapter.getDraft();
  if (!recoveredDraft || recoveredDraft.content.length !== 2) {
    throw new Error('Crash recovery failed to restore accepted blocks.');
  }

  const canonicalSnapshot = recoveredAdapter.toCanonicalDocument(documentId);
  screenplayDocumentSchema.parse(canonicalSnapshot);

  // 5. Scene Navigator Extraction
  const nav = extractSceneNavigation(testBlocks);
  if (nav.length !== 1 || nav[0]?.heading !== 'INT. రవి ఇల్లు — రాత్రి') {
    throw new Error('Scene navigator extraction failed.');
  }
  if (nav[0]?.blockCount !== 2) {
    throw new Error(`Scene navigator expected 2 blocks, got ${nav[0]?.blockCount}`);
  }

  // 6. Virtualized Slicing & Keystroke Latency Benchmark
  const mockScenes = Array.from({ length: 120 }, (_, i) => ({
    sceneId: `scene-${i + 1}`,
    sceneNumber: i + 1,
    heading: `SCENE ${i + 1} — EXT. HYDERABAD ROAD - DAY`,
    blockCount: 15,
    wordCount: 220,
    firstBlockId: `block-${i + 1}`,
  }));

  const startTime = performance.now();
  const iterations = 5000;
  for (let i = 0; i < iterations; i++) {
    const scroll = (i * 13) % 20000;
    computeVirtualSlice(mockScenes, scroll, 900, {
      estimatedBlockHeight: 24,
      sceneHeaderHeight: 48,
      overscan: 2,
    });
  }
  const totalElapsed = performance.now() - startTime;
  const avgLatencyPerKeystrokeMs = totalElapsed / iterations;

  if (avgLatencyPerKeystrokeMs > 1.0) {
    throw new Error(
      `Virtualized keystroke calculation exceeded 1.0ms limit: ${avgLatencyPerKeystrokeMs.toFixed(3)}ms`,
    );
  }

  process.stdout.write(
    `Screenplay editor verified: 18 block nodes, keyboard transitions, Telugu composition safety, crash recovery, scene navigator, and virtualized keystroke latency (${avgLatencyPerKeystrokeMs.toFixed(3)}ms/op).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
