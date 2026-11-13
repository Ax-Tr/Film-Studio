import type { ScreenplayBlockJson } from './screenplay-schema.js'

export const teluguGoldenCorpus = [
  'అక్షరాలు',
  'గుణింతాలు',
  'వత్తులు',
  'సంయుక్తాక్షరాలు',
  'దీర్ఘాలు',
  '౧౨౩౪౫౬౭౮౯౦',
  'రవి రేపు Hyderabad వెళ్తాడు.',
  'నేను రేపు వస్తాను — తప్పకుండా!',
] as const

export const teluguSceneDocument: { type: 'doc'; content: ScreenplayBlockJson[] } = {
  type: 'doc',
  content: [
    {
      type: 'sceneHeading',
      attrs: { blockId: '00000000-0000-4000-8000-000000000001', blockType: 'scene_heading' },
      content: [{ type: 'text', text: 'INT. రవి ఇల్లు — రాత్రి' }],
    },
    {
      type: 'action',
      attrs: { blockId: '00000000-0000-4000-8000-000000000002', blockType: 'action' },
      content: [{ type: 'text', text: 'బయట వర్షం పడుతోంది. గదిలో వెలుతురు మసకగా ఉంది.' }],
    },
    {
      type: 'characterCue',
      attrs: { blockId: '00000000-0000-4000-8000-000000000003', blockType: 'character_cue' },
      content: [{ type: 'text', text: 'రవి' }],
    },
    {
      type: 'dialogue',
      attrs: { blockId: '00000000-0000-4000-8000-000000000004', blockType: 'dialogue' },
      content: [{ type: 'text', text: 'నేను రేపు వస్తాను — తప్పకుండా!' }],
    },
  ],
}
