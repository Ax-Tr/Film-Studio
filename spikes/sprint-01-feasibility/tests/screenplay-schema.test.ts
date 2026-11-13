import { describe, expect, it } from 'vitest'
import { blockNodeName, createScreenplayEditor, screenplayBlockTypes } from '../src/screenplay-schema.js'
import { teluguSceneDocument } from '../src/telugu-fixture.js'

describe('typed screenplay schema', () => {
  it('registers every required screenplay block type as a distinct node', () => {
    const editor = createScreenplayEditor(teluguSceneDocument)
    const schemaNodeNames = new Set(Object.keys(editor.schema.nodes))

    for (const blockType of screenplayBlockTypes) {
      expect(schemaNodeNames.has(blockNodeName(blockType)), blockType).toBe(true)
    }
    editor.destroy()
  })

  it('round-trips Telugu text and stable block IDs without flattening the scene', () => {
    const editor = createScreenplayEditor(teluguSceneDocument)
    const json = editor.getJSON()

    expect(json.content).toHaveLength(4)
    expect(json.content?.[0]?.attrs?.blockId).toBe('00000000-0000-4000-8000-000000000001')
    expect(editor.getText()).toContain('రవి ఇల్లు')
    expect(editor.getText()).toContain('నేను రేపు వస్తాను')
    editor.destroy()
  })
})
