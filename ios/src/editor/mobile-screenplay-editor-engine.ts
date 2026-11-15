import { normalizeTeluguText } from '@film-studio/editor-bridge';

export type ScreenplayBlockType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot';

export interface MobileScreenplayBlock {
  readonly id: string;
  readonly sceneId: string;
  readonly type: ScreenplayBlockType;
  readonly text: string;
  readonly sortOrder: number;
}

export interface MobileEditorState {
  readonly sceneId: string;
  readonly blocks: readonly MobileScreenplayBlock[];
  readonly activeBlockId: string | null;
  readonly revision: number;
  readonly isDirty: boolean;
}

export class MobileScreenplayEditorEngine {
  private blocks: MobileScreenplayBlock[] = [];
  private activeBlockId: string | null = null;
  private revision = 1;
  private isDirty = false;

  constructor(
    private readonly sceneId: string,
    initialBlocks: readonly MobileScreenplayBlock[] = []
  ) {
    if (initialBlocks.length > 0) {
      this.blocks = [...initialBlocks];
      this.activeBlockId = initialBlocks[0]?.id ?? null;
    } else {
      const defaultBlock: MobileScreenplayBlock = {
        id: `blk_${Date.now()}_0`,
        sceneId,
        type: 'scene_heading',
        text: 'INT. SCENE - DAY',
        sortOrder: 1,
      };
      this.blocks = [defaultBlock];
      this.activeBlockId = defaultBlock.id;
    }
  }

  getState(): MobileEditorState {
    return {
      sceneId: this.sceneId,
      blocks: [...this.blocks],
      activeBlockId: this.activeBlockId,
      revision: this.revision,
      isDirty: this.isDirty,
    };
  }

  setActiveBlock(blockId: string): void {
    if (this.blocks.some((b) => b.id === blockId)) {
      this.activeBlockId = blockId;
    }
  }

  updateBlockText(blockId: string, text: string): void {
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      const existing = this.blocks[idx]!;
      // Telugu NFC normalization ensures combining viramas (U+0C4D) are preserved canonically
      const normalized = normalizeTeluguText(text);
      this.blocks[idx] = {
        ...existing,
        text: normalized,
      };
      this.revision++;
      this.isDirty = true;
    }
  }

  setBlockType(blockId: string, type: ScreenplayBlockType): void {
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      const existing = this.blocks[idx]!;
      this.blocks[idx] = {
        ...existing,
        type,
      };
      this.revision++;
      this.isDirty = true;
    }
  }

  /**
   * Enter / Return handling adhering to industry screenplay conventions:
   * - Scene Heading -> Action
   * - Character -> Dialogue
   * - Parenthetical -> Dialogue
   * - Dialogue -> Character (or Action if empty)
   * - Action -> Action
   */
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
      id: `blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sceneId: this.sceneId,
      type: nextType,
      text: '',
      sortOrder: current.sortOrder + 1,
    };

    // Re-index subsequent blocks
    this.blocks.splice(idx + 1, 0, newBlock);
    for (let i = 0; i < this.blocks.length; i++) {
      this.blocks[i] = {
        ...this.blocks[i]!,
        sortOrder: i + 1,
      };
    }

    this.activeBlockId = newBlock.id;
    this.revision++;
    this.isDirty = true;
    return newBlock.id;
  }

  removeBlock(blockId: string): void {
    if (this.blocks.length <= 1) return; // Retain at least 1 block
    const idx = this.blocks.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      this.blocks.splice(idx, 1);
      // Re-index
      for (let i = 0; i < this.blocks.length; i++) {
        this.blocks[i] = {
          ...this.blocks[i]!,
          sortOrder: i + 1,
        };
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

