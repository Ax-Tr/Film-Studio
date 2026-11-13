import { describe, expect, it } from 'vitest'
import { paginate, type LayoutBlock } from '../src/pagination-model.js'

const options = { pageHeight: 100, topMargin: 10, bottomMargin: 10, lineHeight: 10, blockGap: 2 }

describe('deterministic pagination manifest', () => {
  it('keeps a character cue with the following dialogue when they do not fit together', () => {
    const blocks: LayoutBlock[] = [
      { id: 'a', type: 'action', lines: Array.from({ length: 5 }, (_, index) => ({ text: `line ${index}`, advance: 40 })) },
      { id: 'cue', type: 'character_cue', lines: [{ text: 'రవి', advance: 20 }], keepWithNext: true },
      { id: 'dialogue', type: 'dialogue', lines: Array.from({ length: 2 }, (_, index) => ({ text: `dialogue ${index}`, advance: 50 })) },
    ]

    const pages = paginate(blocks, options)

    expect(pages).toHaveLength(2)
    expect(pages[1]?.blocks.map((block) => block.id)).toEqual(['cue', 'dialogue'])
  })

  it('returns identical manifests for identical shaped input', () => {
    const blocks: LayoutBlock[] = [
      { id: 'heading', type: 'scene_heading', lines: [{ text: 'INT. ఇల్లు — రాత్రి', advance: 72 }] },
      { id: 'action', type: 'action', lines: [{ text: 'వర్షం పడుతోంది.', advance: 44 }] },
    ]

    expect(paginate(blocks, options)).toEqual(paginate(structuredClone(blocks), options))
  })
})
