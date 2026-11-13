import { readFile } from 'node:fs/promises'
import { Blob, Buffer as HarfBuzzBuffer, Face, Font, shape, versionString } from 'harfbuzzjs'

export interface ShapedGlyph {
  glyphId: number
  cluster: number
  xAdvance: number
  xOffset: number
  yOffset: number
}

export interface ShapedRun {
  text: string
  fontUnitsPerEm: number
  totalAdvance: number
  glyphs: ShapedGlyph[]
}

export interface TeluguShaper {
  harfBuzzVersion: string
  gsubScripts: string[]
  supports(character: string): boolean
  nominalGlyphs(text: string): Array<number | null>
  shape(text: string): ShapedRun
}

export async function loadTeluguShaper(fontPath: string): Promise<TeluguShaper> {
  const fontBytes = await readFile(fontPath)
  const blob = new Blob(fontBytes)
  const face = new Face(blob)
  const font = new Font(face)
  const supportedCodePoints = new Set(face.collectUnicodes())
  font.setScale(face.upem, face.upem)

  return {
    harfBuzzVersion: versionString(),
    gsubScripts: face.getTableScriptTags('GSUB'),
    supports(character) {
      const codePoint = character.codePointAt(0)
      return codePoint !== undefined && supportedCodePoints.has(codePoint)
    },
    nominalGlyphs(text) {
      return Array.from(text, (character) => font.nominalGlyph(character.codePointAt(0) ?? 0) ?? null)
    },
    shape(text) {
      const buffer = new HarfBuzzBuffer()
      buffer.addText(text)
      buffer.guessSegmentProperties()
      buffer.setLanguage('te')
      buffer.setScript('Telu')
      shape(font, buffer)

      const infos = buffer.getGlyphInfos()
      const positions = buffer.getGlyphPositions()
      const glyphs = infos.map((info, index) => {
        const position = positions[index]
        if (!position) throw new Error(`Missing glyph position at index ${index}`)
        return {
          glyphId: info.codepoint,
          cluster: info.cluster,
          xAdvance: position.xAdvance,
          xOffset: position.xOffset,
          yOffset: position.yOffset,
        }
      })

      return {
        text,
        fontUnitsPerEm: face.upem,
        totalAdvance: glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0),
        glyphs,
      }
    },
  }
}

export interface FallbackRun {
  fontIndex: number
  shaped: ShapedRun
}

export function shapeWithFallback(shapers: TeluguShaper[], text: string): FallbackRun[] {
  if (shapers.length === 0) throw new Error('At least one shaper is required')
  const segments: Array<{ fontIndex: number; text: string }> = []

  for (const character of text) {
    const fontIndex = shapers.findIndex((shaper) => shaper.supports(character))
    if (fontIndex < 0) throw new Error(`No configured font supports U+${character.codePointAt(0)?.toString(16)}`)
    const previous = segments.at(-1)
    if (previous?.fontIndex === fontIndex) previous.text += character
    else segments.push({ fontIndex, text: character })
  }

  return segments.map((segment) => ({
    fontIndex: segment.fontIndex,
    shaped: shapers[segment.fontIndex]!.shape(segment.text),
  }))
}
