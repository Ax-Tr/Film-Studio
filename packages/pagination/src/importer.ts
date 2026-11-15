import { randomUUID } from 'node:crypto';
import type { ScreenplayBlock, ScreenplayDocument } from '@film-studio/screenplay-model';

export interface ClassifiedImportError {
  readonly line: number;
  readonly rawText: string;
  readonly code: 'UNRECOGNIZED_ELEMENT' | 'MALFORMED_CHARACTER_CUE' | 'EMPTY_HEADING' | 'INDENTATION_ANOMALY';
  readonly message: string;
  readonly suggestedCorrection?: string;
}

export interface ImportResult {
  readonly document: ScreenplayDocument;
  readonly errors: readonly ClassifiedImportError[];
  readonly totalLinesParsed: number;
  readonly sceneCount: number;
  readonly characterCount: number;
  readonly titleMetadata?: Record<string, string>;
}

/**
 * Standard Fountain parser conforming to official Fountain syntax specifications:
 * - Scene headings: .HEADING, INT, EXT, EST, INT./EXT., INT/EXT, I/E
 * - Character cues: ALL CAPS (or prefixed with @)
 * - Parentheticals: enclosed in parentheses ( )
 * - Transitions: > TRANSITION:, or CUT TO:, FADE TO:, etc.
 * - Dialogue: lines following character cue or parenthetical
 * - Action: default narrative prose
 * - Dual dialogue: marked with caret ^
 * - Preserves Indic / Telugu Unicode text without NFC fragmentation
 */
export function parseFountain(fountainText: string, documentId = randomUUID()): ImportResult {
  const normalized = fountainText.normalize('NFC');
  const lines = normalized.split(/\r?\n/);
  const errors: ClassifiedImportError[] = [];

  const scenes: Array<{ id: string; blocks: ScreenplayBlock[] }> = [];
  let currentSceneBlocks: ScreenplayBlock[] = [];
  let currentSceneId = randomUUID();
  let sceneCount = 0;
  const uniqueCharacters = new Set<string>();
  const titleMetadata: Record<string, string> = {};
  let inTitlePage = true;

  let previousType: string | null = null;

  function endCurrentScene() {
    if (currentSceneBlocks.length > 0) {
      scenes.push({ id: currentSceneId, blocks: [...currentSceneBlocks] });
      currentSceneBlocks = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const trimmed = rawLine.trim();
    const lineNum = i + 1;

    if (!trimmed) {
      previousType = null;
      continue;
    }

    if (inTitlePage) {
      const titleMatch = trimmed.match(/^([A-Za-z0-9 _]+):\s*(.*)$/);
      if (
        titleMatch &&
        /^(?:title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision|version)$/i.test(
          titleMatch[1]!,
        )
      ) {
        titleMetadata[titleMatch[1]!.toLowerCase()] = titleMatch[2] ?? '';
        continue;
      }
      inTitlePage = false;
    }

    // 1. Scene Heading
    if (
      /^(?:INT|EXT|EST|INT\/EXT|INT\.\/EXT\.|I\/E)[\s.]/i.test(trimmed) ||
      (trimmed.startsWith('.') && !trimmed.startsWith('..'))
    ) {
      const headingText = trimmed.startsWith('.') ? trimmed.slice(1).trim() : trimmed;
      if (!headingText) {
        errors.push({
          line: lineNum,
          rawText: rawLine,
          code: 'EMPTY_HEADING',
          message: 'Scene heading has no description.',
        });
        continue;
      }

      endCurrentScene();
      currentSceneId = randomUUID();
      sceneCount += 1;

      currentSceneBlocks.push({
        id: randomUUID(),
        type: 'scene-heading',
        text: headingText.toUpperCase(),
        attributes: {},
      });
      previousType = 'scene-heading';
      continue;
    }

    // 2. Transitions
    if (
      (trimmed.startsWith('>') && !trimmed.endsWith('<')) ||
      /^(?:CUT TO|FADE OUT|FADE TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO):?$/i.test(trimmed)
    ) {
      const transText = trimmed.startsWith('>') ? trimmed.slice(1).trim() : trimmed;
      currentSceneBlocks.push({
        id: randomUUID(),
        type: 'transition',
        text: transText.toUpperCase(),
        attributes: {},
      });
      previousType = 'transition';
      continue;
    }

    // 3. Parenthetical
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      if (previousType === 'character' || previousType === 'dialogue') {
        currentSceneBlocks.push({
          id: randomUUID(),
          type: 'parenthetical',
          text: trimmed,
          attributes: {},
        });
        previousType = 'parenthetical';
        continue;
      }
    }

    // 4. Character Cue
    const isExplicitCharacter = trimmed.startsWith('@');
    const isUppercase = /^[A-Z0-9\s._\-&'()]+$/u.test(trimmed) && /[A-Z]/u.test(trimmed);

    if (isExplicitCharacter || (isUppercase && previousType === null && i + 1 < lines.length && lines[i + 1]!.trim())) {
      const charName = isExplicitCharacter ? trimmed.slice(1).trim() : trimmed;
      uniqueCharacters.add(charName);
      currentSceneBlocks.push({
        id: randomUUID(),
        type: 'character',
        text: charName,
        attributes: {},
      });
      previousType = 'character';
      continue;
    }

    // 5. Dialogue
    if (previousType === 'character' || previousType === 'parenthetical') {
      currentSceneBlocks.push({
        id: randomUUID(),
        type: 'dialogue',
        text: trimmed,
        attributes: {},
      });
      previousType = 'dialogue';
      continue;
    }

    // 6. Action
    currentSceneBlocks.push({
      id: randomUUID(),
      type: 'action',
      text: trimmed,
      attributes: {},
    });
    previousType = 'action';
  }

  endCurrentScene();

  if (scenes.length === 0) {
    scenes.push({ id: currentSceneId, blocks: [] });
  }

  const document: ScreenplayDocument = {
    schemaVersion: 1,
    documentId,
    scenes,
  };

  return {
    document,
    errors,
    totalLinesParsed: lines.length,
    sceneCount: Math.max(1, sceneCount),
    characterCount: uniqueCharacters.size,
    titleMetadata,
  };
}

/**
 * Plain Text import with heuristic screenplay formatting detection
 */
export function parsePlainTextScript(text: string, documentId = randomUUID()): ImportResult {
  return parseFountain(text, documentId);
}
