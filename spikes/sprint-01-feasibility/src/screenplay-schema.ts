import { Editor, Node } from '@tiptap/core'

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
] as const

export type ScreenplayBlockType = (typeof screenplayBlockTypes)[number]

const nodeNameByType: Record<ScreenplayBlockType, string> = {
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
}

export interface ScreenplayBlockJson {
  type: string
  attrs: {
    blockId: string
    blockType: ScreenplayBlockType
  }
  content?: Array<{ type: 'text'; text: string }>
}

const ScreenplayDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'screenplayBlock+',
})

const ScreenplayText = Node.create({
  name: 'text',
  group: 'inline',
})

function createBlockNode(blockType: ScreenplayBlockType): Node {
  return Node.create({
    name: nodeNameByType[blockType],
    group: 'screenplayBlock',
    content: 'inline*',
    defining: true,
    addAttributes() {
      return {
        blockId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-block-id'),
          renderHTML: (attributes) => ({ 'data-block-id': attributes.blockId }),
        },
        blockType: {
          default: blockType,
          parseHTML: () => blockType,
          renderHTML: () => ({ 'data-screenplay-type': blockType }),
        },
      }
    },
    parseHTML() {
      return [{ tag: `[data-screenplay-type="${blockType}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', HTMLAttributes, 0]
    },
  })
}

export const screenplayExtensions = [
  ScreenplayDocument,
  ScreenplayText,
  ...screenplayBlockTypes.map(createBlockNode),
]

export function createScreenplayEditor(content: { type: 'doc'; content: ScreenplayBlockJson[] }): Editor {
  return new Editor({
    extensions: screenplayExtensions,
    content,
    injectCSS: false,
  })
}

export function blockNodeName(blockType: ScreenplayBlockType): string {
  return nodeNameByType[blockType]
}
