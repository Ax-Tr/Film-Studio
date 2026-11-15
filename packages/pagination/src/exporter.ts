import type { ScreenplayDocument } from '@film-studio/screenplay-model';
import { paginateScreenplay } from './paginator.js';

export interface ExportMetadata {
  readonly title: string;
  readonly author?: string;
  readonly language?: string;
  readonly watermark?: string; // e.g. "CONFIDENTIAL - PRODUCER COPY"
  readonly confidentialPreset?: boolean;
}

/**
 * Standard PDF Generator producing a valid, standalone, copyable/searchable PDF (PDF 1.4 specification)
 * with text stream objects, correct character positioning, and standard margins.
 */
export function generateScreenplayPdf(
  document: ScreenplayDocument,
  meta: ExportMetadata,
): Uint8Array {
  const pagination = paginateScreenplay(document);
  const pdfChunks: string[] = [];

  // Header
  pdfChunks.push('%PDF-1.4\n');
  pdfChunks.push('%\xE2\xE3\xCF\xD3\n');

  const objectOffsets: number[] = [];
  let currentByteOffset = pdfChunks.join('').length;

  function addObject(content: string): number {
    objectOffsets.push(currentByteOffset);
    const objStr = `${objectOffsets.length} 0 obj\n${content}\nendobj\n`;
    pdfChunks.push(objStr);
    currentByteOffset += objStr.length;
    return objectOffsets.length;
  }

  // 1 0 obj: Catalog
  // 2 0 obj: Outlines
  // 3 0 obj: Pages
  // 4 0 obj: Font (Courier)
  // 5 0 obj: Font (Helvetica for header/watermark)

  const pagesObjRef = 3;
  const pageObjectRefs: number[] = [];

  // Add pages and content streams
  for (const page of pagination.pages) {
    let streamText = 'BT\n';

    // Watermark if present
    if (meta.watermark || meta.confidentialPreset) {
      const mark = meta.watermark ?? 'CONFIDENTIAL';
      streamText += `/F2 36 Tf\n0.9 0.9 0.9 rg\n`; // Light grey
      streamText += `150 400 Td\n(${escapePdfText(mark)}) Tj\n`;
      streamText += `0 0 0 rg\n`; // Reset to black
    }

    // Page Number Header
    if (page.pageNumber > 1) {
      streamText += `/F1 12 Tf\n540 732 Td\n(${page.pageNumber}.) Tj\n`;
      streamText += `-540 -732 Td\n`; // Return to origin
    }

    // Body lines
    streamText += `/F1 12 Tf\n`;
    let currentY = 720; // 792 - 72pt top margin

    for (const line of page.lines) {
      const xPos = 108 + line.indentPoints; // 1.5 in (108pt) left margin + indent
      currentY -= 14; // Line pitch

      streamText += `${xPos} ${currentY} Td\n`;
      streamText += `(${escapePdfText(line.text)}) Tj\n`;
      streamText += `-${xPos} -${currentY} Td\n`;
    }

    streamText += 'ET\n';

    // Content Stream object
    const streamLength = streamText.length;
    const streamObjIndex = addObject(
      `<< /Length ${streamLength} >>\nstream\n${streamText}endstream`,
    );

    // Page Object
    const pageObjIndex = addObject(
      `<< /Type /Page\n/Parent ${pagesObjRef} 0 R\n/MediaBox [0 0 612 792]\n/Contents ${streamObjIndex} 0 R\n/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >>\n>>`,
    );
    pageObjectRefs.push(pageObjIndex);
  }

  // Root Catalog (1 0 R)
  addObject(`<< /Type /Catalog\n/Pages ${pagesObjRef} 0 R >>`);

  // Outlines (2 0 R)
  addObject(`<< /Type /Outlines\n/Count 0 >>`);

  // Pages container (3 0 R)
  const kidsStr = pageObjectRefs.map((ref) => `${ref} 0 R`).join(' ');
  addObject(
    `<< /Type /Pages\n/Count ${pageObjectRefs.length}\n/Kids [${kidsStr}]\n>>`,
  );

  // Font 1: Courier standard typeface
  addObject(
    `<< /Type /Font\n/Subtype /Type1\n/BaseFont /Courier\n/Encoding /WinAnsiEncoding\n>>`,
  );

  // Font 2: Helvetica standard typeface
  addObject(
    `<< /Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica-Bold\n/Encoding /WinAnsiEncoding\n>>`,
  );

  // Cross-reference table (xref)
  const xrefOffset = currentByteOffset;
  let xref = `xref\n0 ${objectOffsets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of objectOffsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdfChunks.push(xref);

  // Trailer
  pdfChunks.push(
    `trailer\n<< /Size ${objectOffsets.length + 1}\n/Root 1 0 R\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.from(pdfChunks.join(''), 'binary');
}

/**
 * Escapes parenthesis and backslashes for PDF literal text strings
 */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Formatted Fountain Text exporter
 */
export function exportToFountain(document: ScreenplayDocument): string {
  const lines: string[] = [];
  for (const scene of document.scenes) {
    for (const block of scene.blocks) {
      switch (block.type) {
        case 'scene-heading':
          lines.push('');
          lines.push(block.text.toUpperCase());
          lines.push('');
          break;
        case 'character':
          lines.push('');
          lines.push(block.text.toUpperCase());
          break;
        case 'parenthetical':
          lines.push(block.text.startsWith('(') ? block.text : `(${block.text})`);
          break;
        case 'dialogue':
          lines.push(block.text);
          break;
        case 'transition':
          lines.push('');
          lines.push(`> ${block.text.toUpperCase()}:`);
          lines.push('');
          break;
        default:
          lines.push(block.text);
          lines.push('');
          break;
      }
    }
  }
  return lines.join('\n').trim();
}
