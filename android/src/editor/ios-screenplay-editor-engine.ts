/**
 * iOS Screenplay Editor Engine with iOS Keyboard & VoiceOver Semantics
 *
 * Extends mobile editing capabilities with iOS-specific attributes:
 * - Smart punctuation / curly quotes avoidance for screenplay syntax
 * - Telugu composition & virama (U+0C4D) preservation under iOS Telugu IME
 * - Industry standard enter transitions & tab navigation
 * - VoiceOver accessibility traits, hints, and semantic block descriptions
 * - Inset/Safe Area layout awareness for iPad & iPhone Dynamic Island
 */

import { normalizeTeluguText } from '@film-studio/editor-bridge';
import type { ScreenplayBlockType, MobileScreenplayBlock } from './mobile-screenplay-editor-engine';

export interface IosScreenplayBlock extends MobileScreenplayBlock {
  readonly voiceOverLabel: string;
  readonly accessibilityRole: 'header' | 'text' | 'adjustable';
}

export interface IosEditorState {
  readonly sceneId: string;
  readonly blocks: readonly IosScreenplayBlock[];
  readonly activeBlockId: string | null;
  readonly revision: number;
  readonly isDirty: boolean;
  readonly safeAreaInsetBottom: number;
}

export class IosScreenplayEditorEngine {
  private blocks: IosScreenplayBlock[] = [];
  private activeBlockId: string | null = null;
  private revision = 1;
  private isDirty = false;
  private safeAreaBottom = 34; // Standard iPhone home indicator inset

  constructor(
    private readonly sceneId: string,
    initialBlocks: readonly MobileScreenplayBlock[] = []
  ) {
    if (initialBlocks.length > 0) {
      this.blocks = initialBlocks.map((b) => this.decorateWithIosA11y(b));
      this.activeBlockId = initialBlocks[0]?.id ?? null;
    } else {
      const defaultBlock: MobileScreenplayBlock = {
        id: `blk_ios_${Date.now()}_0`,
        sceneId,
        type: 'scene_heading',
        text: 'INT. SCENE - DAY',
        sortOrder: 1,
      };
      this.blocks = [this.decorateWithIosA11y(defaultBlock)];
      this.activeBlockId = defaultBlock.id;
    }
  }

  private decorateWithIosA11y(b: MobileScreenplayBlock): IosScreenplayBlock {
    let role: 'header' | 'text' | 'adjustable' = 'text';
    let typeName: string;

    switch (b.type) {
      case 'scene_heading':
        role = 'header';
        typeName = 'Scene Heading';
        break;
      case 'character':
        typeName = 'Character Name';
        break;
      case 'dialogue':
        typeName = 'Dialogue';
        break;
      case 'parenthetical':
        typeName = 'Parenthetical';
        break;
      case 'transition':
        typeName = 'Transition';
        break;
      case 'shot':
        typeName = 'Shot Heading';
        break;
      case 'action':
      default:
        role = 'text';
        typeName = 'Action';
        break;
    }

    return {
      ...b,
      voiceOverLabel: `${typeName}, Block ${b.sortOrder}: ${b.text || 'Empty'}`,
      accessibilityRole: role,
    };
  }

  getState(): IosEditorState {
    return {
      sceneId: this.sceneId,
      blocks: [...this.blocks],
      activeBlockId: this.activeBlockId,
      revision: this.revision,
      isDirty: this.isDirty,
      safeAreaInsetBottom: this.safeAreaBottom,
    };
  }

  setSafeAreaInsetBottom(inset: number): void {
    this.safeAreaBottom = Math.max(0, inset);
  }

  setActiveBlock(blockId: string): void {
    if (this.blocks.some((b) => b.id === blockId)) {
      this.activeBlockId = blockId;
    }
  }

  /**
   * Updates block text with iOS Telugu IME normalization and smart quote suppression.
   */
  updateBlockText(blockId: string, text: string): void {
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      const existing = this.blocks[idx]!;
      // Suppress curly double/single quotes to maintain screenplay typography standards
      const uncurled = text
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      // Canonical Telugu NFC normalization preserving viramas (U+0C4D)
      const normalized = normalizeTeluguText(uncurled);

      const updated = {
        ...existing,
        text: normalized,
      };
      this.blocks[idx] = this.decorateWithIosA11y(updated);
      this.revision++;
      this.isDirty = true;
    }
  }

  setBlockType(blockId: string, type: ScreenplayBlockType): void {
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      const existing = this.blocks[idx]!;
      const updated = {
        ...existing,
        type,
      };
      this.blocks[idx] = this.decorateWithIosA11y(updated);
      this.revision++;
      this.isDirty = true;
    }
  }

  handleEnterOnBlock(blockId: string): string {
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return blockId;

    const current = this.blocks[idx]!;
    let nextType: ScreenplayBlockType = 'action';

    if (current.type === 'scene_heading') {
      nextType = 'action';
    } else if (current.type === 'action') {
      nextType = 'action';
    } else if (current.type === 'character') {
      nextType = 'dialogue';
    } else if (current.type === 'parenthetical') {
      nextType = 'dialogue';
    } else if (current.type === 'dialogue') {
      nextType = current.text.trim() === '' ? 'action' : 'character';
    } else if (current.type === 'transition') {
      nextType = 'scene_heading';
    }

    const newBlock: MobileScreenplayBlock = {
      id: `blk_ios_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sceneId: this.sceneId,
      type: nextType,
      text: '',
      sortOrder: current.sortOrder + 1,
    };

    this.blocks.splice(idx + 1, 0, this.decorateWithIosA11y(newBlock));
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i]!;
      this.blocks[i] = this.decorateWithIosA11y({
        ...b,
        sortOrder: i + 1,
      });
    }

    this.activeBlockId = newBlock.id;
    this.revision++;
    this.isDirty = true;
    return newBlock.id;
  }

  removeBlock(blockId: string): void {
    if (this.blocks.length <= 1) return;
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      this.blocks.splice(idx, 1);
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i]!;
        this.blocks[i] = this.decorateWithIosA11y({
          ...b,
          sortOrder: i + 1,
        });
      }
      this.activeBlockId = this.blocks[Math.max(0, idx - 1)]?.id ?? null;
      this.revision++;
      this.isDirty = true;
    }
  }

  markCommitted(): void {
    this.isDirty = false;
  }
}
