import { describe, expect, it } from 'vitest';
import {
  projectBlocks,
  screenplayDocumentSchema,
  stableJson,
} from '../src/index.js';

const documentId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const sceneId = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const blockId = '018f4ce4-a249-79aa-94a6-09195b7d91cf';

function snapshot() {
  return {
    schemaVersion: 1 as const,
    documentId,
    scenes: [
      {
        id: sceneId,
        blocks: [
          {
            id: blockId,
            type: 'dialogue' as const,
            text: 'నమస్కారం — வணக்கம் — ನಮಸ್ಕಾರ — নমস্কার — नमस्कार',
            attributes: { emphasis: true },
          },
        ],
      },
    ],
  };
}

describe('screenplayDocumentSchema', () => {
  it('preserves multilingual Unicode without normalization or mutation', () => {
    const input = snapshot();
    const parsed = screenplayDocumentSchema.parse(input);
    expect(parsed.scenes[0]?.blocks[0]?.text).toBe(
      input.scenes[0]?.blocks[0]?.text,
    );
  });

  it('rejects duplicate scene IDs', () => {
    const input = snapshot();
    input.scenes.push({ id: sceneId, blocks: [] });
    expect(screenplayDocumentSchema.safeParse(input).success).toBe(false);
  });

  it('rejects duplicate block IDs across different scenes', () => {
    const input = snapshot();
    input.scenes.push({
      id: '018f4ce4-aa7f-76a7-b2f1-38d5d2b6c577',
      blocks: [
        {
          id: blockId,
          type: 'action',
          text: 'Duplicate ID',
          attributes: {},
        },
      ],
    });
    expect(screenplayDocumentSchema.safeParse(input).success).toBe(false);
  });

  it('projects stable IDs and source ordering', () => {
    expect(projectBlocks(screenplayDocumentSchema.parse(snapshot()))).toEqual([
      expect.objectContaining({
        documentId,
        sceneId,
        blockId,
        sceneIndex: 0,
        blockIndex: 0,
      }),
    ]);
  });

  it('serializes object keys deterministically while preserving array order', () => {
    expect(stableJson({ z: [2, 1], a: { y: true, x: 'value' } })).toBe(
      '{"a":{"x":"value","y":true},"z":[2,1]}',
    );
  });
});
