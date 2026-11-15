import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { ScreenplayBlockType } from './schema';
import { nodeNameByType, typeByNodeName } from './schema';

export function createBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-000000000000'.replace(/0/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

export function getNextBlockTypeOnEnter(
  currentType: ScreenplayBlockType,
  isEmpty: boolean,
): ScreenplayBlockType {
  switch (currentType) {
    case 'scene_heading':
      return 'action';
    case 'action':
      return 'action';
    case 'character_intro':
      return 'action';
    case 'character_cue':
      return isEmpty ? 'action' : 'dialogue';
    case 'dialogue':
      return isEmpty ? 'action' : 'character_cue';
    case 'parenthetical':
      return 'dialogue';
    case 'voice_over':
    case 'off_screen':
      return 'dialogue';
    case 'transition':
      return 'scene_heading';
    case 'montage':
    case 'flashback':
    case 'dream_sequence':
    case 'intercut':
    case 'shot':
    case 'super':
    case 'sound_cue':
    case 'camera_direction':
    case 'scene_continuation':
      return 'action';
    default:
      return 'action';
  }
}

export function getNextBlockTypeOnTab(
  currentType: ScreenplayBlockType,
  shiftKey = false,
): ScreenplayBlockType {
  if (shiftKey) {
    switch (currentType) {
      case 'character_cue':
        return 'action';
      case 'parenthetical':
        return 'character_cue';
      case 'dialogue':
        return 'action';
      case 'transition':
        return 'action';
      default:
        return 'action';
    }
  }

  switch (currentType) {
    case 'action':
      return 'character_cue';
    case 'character_cue':
      return 'parenthetical';
    case 'dialogue':
      return 'parenthetical';
    case 'parenthetical':
      return 'dialogue';
    default:
      return 'action';
  }
}

export interface ScreenplayKeyboardOptions {
  readonly isComposing?: () => boolean;
}

export const ScreenplayKeyboardTransitions = Extension.create<ScreenplayKeyboardOptions>({
  name: 'screenplayKeyboard',

  addOptions() {
    return {
      isComposing: () => false,
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (this.options.isComposing?.()) {
          return false;
        }

        const { state, dispatch } = editor.view;
        const { selection } = state;
        const { $from } = selection;
        const currentNode = $from.parent;

        const currentType = typeByNodeName[currentNode.type.name];
        if (!currentType) return false;

        const isEmpty = currentNode.textContent.trim().length === 0;
        const nextType = getNextBlockTypeOnEnter(currentType, isEmpty);
        const nextNodeName = nodeNameByType[nextType];
        const nextNodeType = state.schema.nodes[nextNodeName];

        if (!nextNodeType) return false;

        const newBlockId = createBlockId();
        const attrs = {
          ...currentNode.attrs,
          blockId: newBlockId,
          blockType: nextType,
        };

        const tr = state.tr;

        if (isEmpty && currentType !== nextType) {
          // Transform empty node in-place
          tr.setNodeMarkup($from.before(), nextNodeType, attrs);
          dispatch(tr);
          return true;
        }

        // Split or insert block below
        const endPos = $from.end();
        tr.insert(endPos, nextNodeType.create(attrs));
        tr.setSelection(TextSelection.near(tr.doc.resolve(endPos + 1)));
        dispatch(tr);
        return true;
      },

      Tab: ({ editor }) => {
        if (this.options.isComposing?.()) {
          return false;
        }

        const { state, dispatch } = editor.view;
        const { selection } = state;
        const { $from } = selection;
        const currentNode = $from.parent;

        const currentType = typeByNodeName[currentNode.type.name];
        if (!currentType) return false;

        const nextType = getNextBlockTypeOnTab(currentType, false);
        const nextNodeName = nodeNameByType[nextType];
        const nextNodeType = state.schema.nodes[nextNodeName];

        if (!nextNodeType) return false;

        const tr = state.tr;
        tr.setNodeMarkup($from.before(), nextNodeType, {
          ...currentNode.attrs,
          blockType: nextType,
        });
        dispatch(tr);
        return true;
      },

      'Shift-Tab': ({ editor }) => {
        if (this.options.isComposing?.()) {
          return false;
        }

        const { state, dispatch } = editor.view;
        const { selection } = state;
        const { $from } = selection;
        const currentNode = $from.parent;

        const currentType = typeByNodeName[currentNode.type.name];
        if (!currentType) return false;

        const nextType = getNextBlockTypeOnTab(currentType, true);
        const nextNodeName = nodeNameByType[nextType];
        const nextNodeType = state.schema.nodes[nextNodeName];

        if (!nextNodeType) return false;

        const tr = state.tr;
        tr.setNodeMarkup($from.before(), nextNodeType, {
          ...currentNode.attrs,
          blockType: nextType,
        });
        dispatch(tr);
        return true;
      },
    };
  },
});
