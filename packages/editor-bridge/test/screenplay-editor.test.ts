import { describe, expect, it } from 'vitest';
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
} from '../src/index.js';

describe('Structured Screenplay Editor Schema & Extensions', () => {
  it('registers all 18 screenplay block types with distinct nodes', () => {
    const extensions = createScreenplayExtensions();
    // doc + text + 18 block nodes = 20 extensions
    expect(extensions).toHaveLength(20);

    const registeredNodeNames = new Set(extensions.map((ext) => ext.name));
    for (const blockType of screenplayBlockTypes) {
      expect(registeredNodeNames.has(nodeNameByType[blockType])).toBe(true);
    }
  });

  it('generates unique UUID block IDs', () => {
    const id1 = createBlockId();
    const id2 = createBlockId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('Keyboard Transitions', () => {
  it('follows standard screenplay Enter transition conventions', () => {
    expect(getNextBlockTypeOnEnter('scene_heading', false)).toBe('action');
    expect(getNextBlockTypeOnEnter('action', false)).toBe('action');
    expect(getNextBlockTypeOnEnter('character_cue', false)).toBe('dialogue');
    expect(getNextBlockTypeOnEnter('dialogue', false)).toBe('character_cue');
    expect(getNextBlockTypeOnEnter('dialogue', true)).toBe('action');
    expect(getNextBlockTypeOnEnter('parenthetical', false)).toBe('dialogue');
    expect(getNextBlockTypeOnEnter('transition', false)).toBe('scene_heading');
    expect(getNextBlockTypeOnEnter('shot', false)).toBe('action');
  });

  it('follows standard screenplay Tab transition conventions', () => {
    expect(getNextBlockTypeOnTab('action', false)).toBe('character_cue');
    expect(getNextBlockTypeOnTab('character_cue', false)).toBe('parenthetical');
    expect(getNextBlockTypeOnTab('dialogue', false)).toBe('parenthetical');
    expect(getNextBlockTypeOnTab('parenthetical', false)).toBe('dialogue');

    // Shift-Tab backwards
    expect(getNextBlockTypeOnTab('character_cue', true)).toBe('action');
    expect(getNextBlockTypeOnTab('parenthetical', true)).toBe('character_cue');
  });
});

describe('Telugu & Multilingual Composition Safety', () => {
  it('tracks composition state correctly', () => {
    const tracker = new CompositionTracker();
    expect(tracker.isComposing).toBe(false);

    const listeners: Record<string, (e: unknown) => void> = {};
    const mockElement = {
      addEventListener: (type: string, listener: (e: unknown) => void) => {
        listeners[type] = listener;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    };

    tracker.attach(mockElement as unknown as HTMLElement);

    listeners.compositionstart?.(new Event('compositionstart'));
    expect(tracker.isComposing).toBe(true);

    listeners.compositionend?.(new Event('compositionend'));
    expect(tracker.isComposing).toBe(false);
  });

  it('validates Telugu golden text roundtrip without dropping viramas or conjuncts', () => {
    const teluguSample = 'INT. రవి ఇల్లు — రాత్రి. బయట వర్షం పడుతోంది. నేను రేపు వస్తాను — తప్పకుండా!';
    expect(verifyTeluguRoundtrip(teluguSample, teluguSample)).toBe(true);

    // If virama is stripped, roundtrip fails
    const corruptSample = teluguSample.replace(/\u0C4D/g, '');
    expect(verifyTeluguRoundtrip(teluguSample, corruptSample)).toBe(false);
  });
});

describe('Scene Navigator', () => {
  it('extracts scenes, headings, block counts, and word counts from block list', () => {
    const blocks: ScreenplayBlockJson[] = [
      {
        type: 'sceneHeading',
        attrs: {
          blockId: '00000000-0000-4000-8000-000000000001',
          blockType: 'scene_heading',
          sceneId: 'scene-1',
          sceneNumber: 1,
        },
        content: [{ type: 'text', text: 'INT. COFFEE SHOP - DAY' }],
      },
      {
        type: 'action',
        attrs: {
          blockId: '00000000-0000-4000-8000-000000000002',
          blockType: 'action',
        },
        content: [{ type: 'text', text: 'A busy morning in Hyderabad.' }],
      },
      {
        type: 'characterCue',
        attrs: {
          blockId: '00000000-0000-4000-8000-000000000003',
          blockType: 'character_cue',
        },
        content: [{ type: 'text', text: 'ANAND' }],
      },
      {
        type: 'dialogue',
        attrs: {
          blockId: '00000000-0000-4000-8000-000000000004',
          blockType: 'dialogue',
        },
        content: [{ type: 'text', text: 'Good morning.' }],
      },
      {
        type: 'sceneHeading',
        attrs: {
          blockId: '00000000-0000-4000-8000-000000000005',
          blockType: 'scene_heading',
          sceneId: 'scene-2',
          sceneNumber: 2,
        },
        content: [{ type: 'text', text: 'EXT. STREET - CONTINUOUS' }],
      },
    ];

    const scenes = extractSceneNavigation(blocks);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.heading).toBe('INT. COFFEE SHOP - DAY');
    expect(scenes[0]?.sceneNumber).toBe(1);
    expect(scenes[0]?.blockCount).toBe(4);
    expect(scenes[1]?.heading).toBe('EXT. STREET - CONTINUOUS');
    expect(scenes[1]?.sceneNumber).toBe(2);
    expect(scenes[1]?.blockCount).toBe(1);
  });
});

describe('Local Transactional Save Adapter', () => {
  it('saves drafts, tracks dirty status, and builds canonical document snapshot', () => {
    const documentId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
    const adapter = new LocalTransactionalSaveAdapter(documentId);

    const blocks: ScreenplayBlockJson[] = [
      {
        type: 'sceneHeading',
        attrs: {
          blockId: '018f4ce4-d16a-78b4-b2b1-85ec72e26321',
          blockType: 'scene_heading',
          sceneId: '018f4ce4-d16a-78b4-b2b1-85ec72e26322',
        },
        content: [{ type: 'text', text: 'INT. STUDIO - DAY' }],
      },
      {
        type: 'action',
        attrs: {
          blockId: '018f4ce4-d16a-78b4-b2b1-85ec72e26323',
          blockType: 'action',
        },
        content: [{ type: 'text', text: 'Director sits at the console.' }],
      },
    ];

    const state = adapter.saveDraft(blocks, 1);
    expect(state.isDirty).toBe(true);
    expect(adapter.hasUnsavedChanges()).toBe(true);

    const canonicalDoc = adapter.toCanonicalDocument(documentId);
    expect(canonicalDoc.schemaVersion).toBe(1);
    expect(canonicalDoc.documentId).toBe(documentId);
    expect(canonicalDoc.scenes).toHaveLength(1);
    expect(canonicalDoc.scenes[0]?.blocks).toHaveLength(2);
    expect(canonicalDoc.scenes[0]?.blocks[0]?.type).toBe('scene-heading');
    expect(canonicalDoc.scenes[0]?.blocks[1]?.type).toBe('action');

    adapter.markCommitted(2);
    expect(adapter.hasUnsavedChanges()).toBe(false);
  });
});

describe('Virtualized Slicing Engine', () => {
  it('bounds rendered scenes and computes scroll offsets for large documents', () => {
    // Generate 50 mock scenes
    const scenes = Array.from({ length: 50 }, (_, i) => ({
      sceneId: `scene-${i + 1}`,
      sceneNumber: i + 1,
      heading: `SCENE ${i + 1}`,
      blockCount: 10,
      wordCount: 150,
      firstBlockId: `block-${i + 1}`,
    }));

    // Scroll to position 1000px with 800px viewport
    const slice = computeVirtualSlice(scenes, 1000, 800, {
      estimatedBlockHeight: 24,
      sceneHeaderHeight: 48,
      overscan: 2,
    });

    expect(slice.visibleScenes.length).toBeLessThan(scenes.length);
    expect(slice.totalHeight).toBeGreaterThan(0);
    expect(slice.startIndex).toBeLessThanOrEqual(slice.endIndex);
    expect(slice.paddingTop).toBeGreaterThanOrEqual(0);
    expect(slice.paddingBottom).toBeGreaterThanOrEqual(0);
  });
});
