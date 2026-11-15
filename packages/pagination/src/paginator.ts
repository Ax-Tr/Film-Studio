import { createHash } from 'node:crypto';
import type { ScreenplayBlock, ScreenplayDocument } from '@film-studio/screenplay-model';

export interface PageLayoutDimensions {
  readonly pageWidthPoints: number; // e.g. 612 (8.5 inches * 72)
  readonly pageHeightPoints: number; // e.g. 792 (11 inches * 72)
  readonly topMarginPoints: number; // 72 (1 inch)
  readonly bottomMarginPoints: number; // 72 (1 inch)
  readonly leftMarginPoints: number; // 108 (1.5 inches)
  readonly rightMarginPoints: number; // 72 (1.0 inch)
  readonly usableHeightPoints: number; // 792 - 144 = 648
  readonly lineHeightPoints: number; // 12 points (Courier 12pt line pitch)
  readonly maxLinesPerPage: number; // 54 lines standard
}

export const standardScreenplayDimensions: PageLayoutDimensions = {
  pageWidthPoints: 612,
  pageHeightPoints: 792,
  topMarginPoints: 72,
  bottomMarginPoints: 72,
  leftMarginPoints: 108,
  rightMarginPoints: 72,
  usableHeightPoints: 648,
  lineHeightPoints: 12,
  maxLinesPerPage: 54,
};

export interface FormattedBlockLine {
  readonly blockId: string;
  readonly sceneId: string;
  readonly sceneNumber?: number;
  readonly blockType: string;
  readonly text: string;
  readonly indentPoints: number;
  readonly widthPoints: number;
}

export interface PaginatedPage {
  readonly pageNumber: number;
  readonly lines: readonly FormattedBlockLine[];
  readonly totalLines: number;
  readonly headerText?: string;
}

export interface PaginationResult {
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly totalPages: number;
  readonly totalLines: number;
  readonly pages: readonly PaginatedPage[];
  readonly checksumSha256: string;
}

/**
 * Standard industry screenplay block width constraints in Courier characters:
 * - Scene Heading / Action: 60 chars (approx 360pt)
 * - Dialogue: 35 chars (approx 210pt, indent 108pt + 108pt = 216pt)
 * - Character Cue: 37 chars indent
 * - Parenthetical: 25 chars (indent 150pt)
 * - Transition: right-aligned
 */
export function estimateBlockLineCount(blockType: string, text: string): number {
  if (!text || text.trim().length === 0) return 1;

  let maxCharsPerLine: number;
  switch (blockType) {
    case 'character':
      maxCharsPerLine = 35;
      break;
    case 'parenthetical':
      maxCharsPerLine = 25;
      break;
    case 'dialogue':
      maxCharsPerLine = 35;
      break;
    case 'transition':
      maxCharsPerLine = 20;
      break;
    default:
      maxCharsPerLine = 60;
      break;
  }

  const paragraphs = text.split('\n');
  let lines = 0;
  for (const para of paragraphs) {
    if (para.length === 0) {
      lines += 1;
    } else {
      lines += Math.ceil(para.length / maxCharsPerLine);
    }
  }

  return Math.max(1, lines);
}

/**
 * Deterministic screenplay paginator conforming to standard pagination rules:
 * - Scene Headings are not orphaned at the bottom of a page (widow/orphan protection).
 * - Character cues cannot appear as the last line on a page without at least 1 line of dialogue.
 */
export function paginateScreenplay(
  document: ScreenplayDocument,
  dimensions: PageLayoutDimensions = standardScreenplayDimensions,
): PaginationResult {
  const pages: PaginatedPage[] = [];
  let currentPageLines: FormattedBlockLine[] = [];
  let currentLinesOnPage = 0;
  let pageNum = 1;

  function pushPage() {
    pages.push({
      pageNumber: pageNum,
      lines: [...currentPageLines],
      totalLines: currentLinesOnPage,
      ...(pageNum > 1 ? { headerText: `${pageNum}.` } : {}),
    });
    pageNum += 1;
    currentPageLines = [];
    currentLinesOnPage = 0;
  }

  // Flatten blocks from canonical scenes structure
  const allBlocks: Array<{ block: ScreenplayBlock; sceneId: string; sceneIndex: number }> = [];
  for (let sIdx = 0; sIdx < document.scenes.length; sIdx++) {
    const scene = document.scenes[sIdx]!;
    for (const block of scene.blocks) {
      allBlocks.push({ block, sceneId: scene.id, sceneIndex: sIdx + 1 });
    }
  }

  for (let i = 0; i < allBlocks.length; i++) {
    const { block, sceneId, sceneIndex } = allBlocks[i]!;
    const lineCount = estimateBlockLineCount(block.type, block.text);

    // Spacing rules
    let leadingBlankLines = 1;
    if (block.type === 'scene-heading') {
      leadingBlankLines = currentLinesOnPage === 0 ? 0 : 2;
    } else if (block.type === 'dialogue' || block.type === 'parenthetical') {
      leadingBlankLines = 0;
    } else if (currentLinesOnPage === 0) {
      leadingBlankLines = 0;
    }

    const neededLines = lineCount + leadingBlankLines;

    // Widow/Orphan protection
    let orphanProtectionBonus = 0;
    if (block.type === 'scene-heading' && i + 1 < allBlocks.length) {
      orphanProtectionBonus = 2;
    }
    if (block.type === 'character' && i + 1 < allBlocks.length) {
      orphanProtectionBonus = 1;
    }

    if (
      currentLinesOnPage > 0 &&
      currentLinesOnPage + neededLines + orphanProtectionBonus > dimensions.maxLinesPerPage
    ) {
      pushPage();
    }

    currentPageLines.push({
      blockId: block.id,
      sceneId,
      sceneNumber: sceneIndex,
      blockType: block.type,
      text: block.text,
      indentPoints: block.type === 'character' ? 216 : block.type === 'dialogue' ? 144 : 0,
      widthPoints: block.type === 'dialogue' ? 250 : 432,
    });

    currentLinesOnPage += neededLines;
  }

  if (currentPageLines.length > 0 || pages.length === 0) {
    pushPage();
  }

  const checksumInput = JSON.stringify(pages.map((p) => ({ p: p.pageNumber, l: p.lines.length })));
  const checksumSha256 = createHash('sha256').update(checksumInput).digest('hex');

  return {
    rendererId: 'deterministic-screenplay-paginator',
    rendererVersion: '1.0.0',
    totalPages: pages.length,
    totalLines: pages.reduce((acc, p) => acc + p.totalLines, 0),
    pages,
    checksumSha256,
  };
}
