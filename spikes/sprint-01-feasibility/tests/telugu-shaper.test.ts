import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadTeluguShaper, shapeWithFallback } from '../src/telugu-shaper.js'
import { teluguGoldenCorpus } from '../src/telugu-fixture.js'

const teluguFontPath = resolve(process.cwd(), 'assets/fonts/NotoSansTelugu-Regular.ttf')
const latinFontPath = resolve(process.cwd(), 'assets/fonts/NotoSans-Variable.ttf')

describe('HarfBuzz Telugu shaping', () => {
  it('uses a font with a Telugu OpenType shaping script', async () => {
    const shaper = await loadTeluguShaper(teluguFontPath)

    expect(shaper.gsubScripts.some((script) => script.trim().toLowerCase().startsWith('tel'))).toBe(true)
  })

  it('produces positioned, non-missing glyphs for the Telugu golden corpus', async () => {
    const shaper = await loadTeluguShaper(teluguFontPath)

    for (const text of teluguGoldenCorpus.filter((candidate) => !candidate.includes('Hyderabad'))) {
      const run = shaper.shape(text)
      expect(run.glyphs.length, text).toBeGreaterThan(0)
      expect(run.totalAdvance, text).toBeGreaterThan(0)
      expect(run.glyphs.every((glyph) => glyph.glyphId !== 0), text).toBe(true)
    }
  })

  it('applies Indic shaping instead of returning only nominal codepoint glyphs', async () => {
    const shaper = await loadTeluguShaper(teluguFontPath)
    const text = 'సంయుక్తాక్షరాలు'
    const nominal = shaper.nominalGlyphs(text)
    const shaped = shaper.shape(text).glyphs.map((glyph) => glyph.glyphId)

    expect(shaped).not.toEqual(nominal)
  })

  it('returns the same glyph manifest for repeated shaping with pinned inputs', async () => {
    const shaper = await loadTeluguShaper(teluguFontPath)
    const text = 'నేను రేపు వస్తాను — తప్పకుండా!'

    expect(shaper.shape(text)).toEqual(shaper.shape(text))
  })

  it('segments mixed Telugu/English text across pinned Telugu and Latin fonts', async () => {
    const telugu = await loadTeluguShaper(teluguFontPath)
    const latin = await loadTeluguShaper(latinFontPath)
    const runs = shapeWithFallback([telugu, latin], 'రవి రేపు Hyderabad వెళ్తాడు.')

    expect(runs.some((run) => run.fontIndex === 0)).toBe(true)
    expect(runs.some((run) => run.fontIndex === 1)).toBe(true)
    expect(runs.flatMap((run) => run.shaped.glyphs).every((glyph) => glyph.glyphId !== 0)).toBe(true)
  })
})
