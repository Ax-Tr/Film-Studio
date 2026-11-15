import type { ScreenplayBlockJson } from './schema';
import { typeByNodeName } from './schema';

export interface LocalSaveState {
  readonly documentId: string;
  readonly revision: number;
  readonly content: readonly ScreenplayBlockJson[];
  readonly timestamp: number;
  readonly isDirty: boolean;
}

export class LocalTransactionalSaveAdapter {
  private static readonly memoryFallback = new Map<string, string>();
  private currentSaveState: LocalSaveState | null = null;
  private storageKeyPrefix = 'film-studio.draft.';

  constructor(private readonly documentId: string) {
    this.currentSaveState = this.loadFromStorage();
  }

  saveDraft(content: readonly ScreenplayBlockJson[], revision: number): LocalSaveState {
    const state: LocalSaveState = {
      documentId: this.documentId,
      revision,
      content,
      timestamp: Date.now(),
      isDirty: true,
    };
    this.currentSaveState = state;
    this.writeToStorage(state);
    return state;
  }

  markCommitted(revision: number): void {
    if (this.currentSaveState) {
      this.currentSaveState = {
        ...this.currentSaveState,
        revision,
        isDirty: false,
      };
      this.writeToStorage(this.currentSaveState);
    }
  }

  getDraft(): LocalSaveState | null {
    return this.currentSaveState;
  }

  hasUnsavedChanges(): boolean {
    return this.currentSaveState?.isDirty ?? false;
  }

  clearDraft(): void {
    this.currentSaveState = null;
    const key = this.storageKeyPrefix + this.documentId;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignored
      }
    }
    LocalTransactionalSaveAdapter.memoryFallback.delete(key);
  }

  toCanonicalDocument(documentId: string): {
    schemaVersion: 1;
    documentId: string;
    scenes: Array<{
      id: string;
      blocks: Array<{
        id: string;
        type: 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition' | 'shot' | 'note';
        text: string;
        attributes: Record<string, string | number | boolean>;
      }>;
    }>;
  } {
    const blocks = this.currentSaveState?.content ?? [];
    const scenes: Array<{
      id: string;
      blocks: Array<{
        id: string;
        type: 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition' | 'shot' | 'note';
        text: string;
        attributes: Record<string, string | number | boolean>;
      }>;
    }> = [];

    let currentScene: (typeof scenes)[number] | null = null;

    for (const b of blocks) {
      const rawType = b.attrs?.blockType || typeByNodeName[b.type] || 'action';
      const text = b.content?.map((c) => c.text).join('') ?? '';
      const blockId = b.attrs?.blockId;

      // Canonical block type mapping conforming to 0002_canonical_content.sql
      let type: 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition' | 'shot' | 'note';
      switch (rawType) {
        case 'scene_heading':
          type = 'scene-heading';
          break;
        case 'action':
        case 'character_intro':
        case 'montage':
        case 'flashback':
        case 'dream_sequence':
        case 'intercut':
        case 'scene_continuation':
          type = 'action';
          break;
        case 'character_cue':
          type = 'character';
          break;
        case 'dialogue':
        case 'voice_over':
        case 'off_screen':
          type = 'dialogue';
          break;
        case 'parenthetical':
          type = 'parenthetical';
          break;
        case 'transition':
          type = 'transition';
          break;
        case 'shot':
        case 'camera_direction':
          type = 'shot';
          break;
        default:
          type = 'action';
      }

      if (type === 'scene-heading' || !currentScene) {
        const sceneId = b.attrs?.sceneId || blockId;
        currentScene = {
          id: sceneId,
          blocks: [],
        };
        scenes.push(currentScene);
      }

      currentScene.blocks.push({
        id: blockId,
        type,
        text,
        attributes: {
          originalType: rawType,
        },
      });
    }

    return {
      schemaVersion: 1,
      documentId,
      scenes,
    };
  }

  private loadFromStorage(): LocalSaveState | null {
    const key = this.storageKeyPrefix + this.documentId;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as LocalSaveState;
      } catch {
        return null;
      }
    }
    const mem = LocalTransactionalSaveAdapter.memoryFallback.get(key);
    return mem ? (JSON.parse(mem) as LocalSaveState) : null;
  }

  private writeToStorage(state: LocalSaveState): void {
    const key = this.storageKeyPrefix + this.documentId;
    const serialized = JSON.stringify(state);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, serialized);
      } catch {
        // Ignored
      }
    }
    LocalTransactionalSaveAdapter.memoryFallback.set(key, serialized);
  }
}
