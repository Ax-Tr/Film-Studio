import { describe, expect, it } from 'vitest';
import { parseFountain } from '../src/importer.js';
import { paginateScreenplay } from '../src/paginator.js';
import { exportToFountain, generateScreenplayPdf } from '../src/exporter.js';

describe('Pagination, Importer, and Exporter', () => {
  const sampleFountain = `
Title: RRR
Author: S. S. Rajamouli

EXT. FOREST - NIGHT

BHEEM
(whispering in Telugu)
మనం వేట ప్రారంభించాలి.

Allamm shoots through the brush. A tiger leaps!

> CUT TO:

INT. BARRACKS - DAY

RAMARAJU
Stand down!
`.trim();

  it('parses Fountain into canonical screenplay model accurately', () => {
    const result = parseFountain(sampleFountain);
    expect(result.errors.length).toBe(0);
    expect(result.sceneCount).toBe(2);
    expect(result.characterCount).toBe(2);
    expect(result.document.scenes.length).toBe(2);

    const firstScene = result.document.scenes[0]!;
    expect(firstScene.blocks[0]!.type).toBe('scene-heading');
    expect(firstScene.blocks[0]!.text).toBe('EXT. FOREST - NIGHT');
    expect(firstScene.blocks[1]!.type).toBe('character');
    expect(firstScene.blocks[1]!.text).toBe('BHEEM');
    expect(firstScene.blocks[2]!.type).toBe('parenthetical');
    expect(firstScene.blocks[3]!.type).toBe('dialogue');
    expect(firstScene.blocks[3]!.text).toBe('మనం వేట ప్రారంభించాలి.');
  });

  it('paginates deterministically with consistent SHA256 checksums', () => {
    const parsed = parseFountain(sampleFountain);
    const paginated1 = paginateScreenplay(parsed.document);
    const paginated2 = paginateScreenplay(parsed.document);

    expect(paginated1.totalPages).toBe(1);
    expect(paginated1.totalLines).toBeGreaterThan(5);
    expect(paginated1.checksumSha256).toBe(paginated2.checksumSha256);
    expect(paginated1.rendererId).toBe('deterministic-screenplay-paginator');
  });

  it('exports to searchable PDF format with watermark and PDF 1.4 header', () => {
    const parsed = parseFountain(sampleFountain);
    const pdfBytes = generateScreenplayPdf(parsed.document, {
      title: 'RRR Screenplay',
      watermark: 'CONFIDENTIAL PREVIEW',
      confidentialPreset: true,
    });

    const pdfString = Buffer.from(pdfBytes).toString('binary');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString).toContain('CONFIDENTIAL PREVIEW');
    expect(pdfString).toContain('EXT. FOREST - NIGHT');
    expect(pdfString).toContain('startxref');
    expect(pdfString.trim().endsWith('%%EOF')).toBe(true);
  });

  it('roundtrips Fountain text preservation', () => {
    const parsed = parseFountain(sampleFountain);
    const exported = exportToFountain(parsed.document);
    expect(exported).toContain('EXT. FOREST - NIGHT');
    expect(exported).toContain('BHEEM');
    expect(exported).toContain('మనం వేట ప్రారంభించాలి.');
    expect(exported).toContain('RAMARAJU');
  });
});

