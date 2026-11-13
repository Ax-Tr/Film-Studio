import { resolve } from 'node:path'
import { loadTeluguShaper, shapeWithFallback } from '../src/telugu-shaper.js'
import { teluguGoldenCorpus } from '../src/telugu-fixture.js'

const teluguFontPath = resolve(process.cwd(), 'assets/fonts/NotoSansTelugu-Regular.ttf')
const latinFontPath = resolve(process.cwd(), 'assets/fonts/NotoSans-Variable.ttf')
const teluguShaper = await loadTeluguShaper(teluguFontPath)
const latinShaper = await loadTeluguShaper(latinFontPath)

const result = {
  engine: `HarfBuzz ${teluguShaper.harfBuzzVersion}`,
  fonts: [
    { name: 'Noto Sans Telugu Regular 2.005', license: 'OFL-1.1' },
    { name: 'Noto Sans Variable', license: 'OFL-1.1' },
  ],
  gsubScripts: teluguShaper.gsubScripts,
  runs: teluguGoldenCorpus.map((text) => ({ text, segments: shapeWithFallback([teluguShaper, latinShaper], text) })),
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
