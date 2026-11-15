import { Node } from '@tiptap/core';

export const screenplayBlockTypes = [
  'scene_heading',
  'action',
  'character_intro',
  'character_cue',
  'dialogue',
  'parenthetical',
  'voice_over',
  'off_screen',
  'transition',
  'montage',
  'flashback',
  'dream_sequence',
  'intercut',
  'shot',
  'super',
  'sound_cue',
  'camera_direction',
  'scene_continuation',
] as const;

export type ScreenplayBlockType = (typeof screenplayBlockTypes)[number];

export const nodeNameByType: Record<ScreenplayBlockType, string> = {
  scene_heading: 'sceneHeading',
  action: 'action',
  character_intro: 'characterIntro',
  character_cue: 'characterCue',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  voice_over: 'voiceOver',
  off_screen: 'offScreen',
  transition: 'transition',
  montage: 'montage',
  flashback: 'flashback',
  dream_sequence: 'dreamSequence',
  intercut: 'intercut',
  shot: 'shot',
  super: 'super',
  sound_cue: 'soundCue',
  camera_direction: 'cameraDirection',
  scene_continuation: 'sceneContinuation',
};

export const typeByNodeName: Record<string, ScreenplayBlockType> = Object.fromEntries(
  Object.entries(nodeNameByType).map(([type, nodeName]) => [nodeName, type as ScreenplayBlockType]),
);

export interface ScreenplayBlockJson {
  type: string;
  attrs: {
    blockId: string;
    blockType: ScreenplayBlockType;
    sceneId?: string;
    sceneNumber?: number;
  };
  content?: Array<{ type: string; text?: string }>;
}

export const ScreenplayDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'screenplayBlock+',
});

export const ScreenplayText = Node.create({
  name: 'text',
  group: 'inline',
});

export function createBlockNode(blockType: ScreenplayBlockType): Node {
  const nodeName = nodeNameByType[blockType];
  return Node.create({
    name: nodeName,
    group: 'screenplayBlock',
    content: 'inline*',
    defining: true,
    addAttributes() {
      return {
        blockId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-block-id'),
          renderHTML: (attributes) => ({ 'data-block-id': attributes.blockId as string }),
        },
        blockType: {
          default: blockType,
          parseHTML: () => blockType,
          renderHTML: () => ({ 'data-screenplay-type': blockType }),
        },
        sceneId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-scene-id'),
          renderHTML: (attributes) =>
            attributes.sceneId ? { 'data-scene-id': attributes.sceneId as string } : {},
        },
        sceneNumber: {
          default: null,
          parseHTML: (element) => {
            const val = element.getAttribute('data-scene-number');
            return val ? Number(val) : null;
          },
          renderHTML: (attributes) =>
            attributes.sceneNumber
              ? { 'data-scene-number': String(attributes.sceneNumber) }
              : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: `[data-screenplay-type="${blockType}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', HTMLAttributes, 0];
    },
  });
}

export function createScreenplayExtensions(): Node[] {
  return [
    ScreenplayDocument,
    ScreenplayText,
    ...screenplayBlockTypes.map((type) => createBlockNode(type)),
  ];
}
