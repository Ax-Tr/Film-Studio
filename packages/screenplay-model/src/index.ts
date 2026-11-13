import { z } from 'zod';

export const SCREENPLAY_SCHEMA_VERSION = 1 as const;

export const screenplayBlockTypeSchema = z.enum([
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
  'shot',
  'note',
]);

const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const screenplayBlockSchema = z
  .object({
    id: z.string().uuid(),
    type: screenplayBlockTypeSchema,
    text: z.string(),
    attributes: z.record(z.string(), attributeValueSchema).default({}),
  })
  .strict();

export const screenplaySceneSchema = z
  .object({
    id: z.string().uuid(),
    blocks: z.array(screenplayBlockSchema),
  })
  .strict();

export const screenplayDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCREENPLAY_SCHEMA_VERSION),
    documentId: z.string().uuid(),
    scenes: z.array(screenplaySceneSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const sceneIds = new Set<string>();
    const blockIds = new Set<string>();
    for (const [sceneIndex, scene] of document.scenes.entries()) {
      if (sceneIds.has(scene.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Scene IDs must be unique within a document snapshot.',
          path: ['scenes', sceneIndex, 'id'],
        });
      }
      sceneIds.add(scene.id);
      for (const [blockIndex, block] of scene.blocks.entries()) {
        if (blockIds.has(block.id)) {
          context.addIssue({
            code: 'custom',
            message: 'Block IDs must be unique within a document snapshot.',
            path: ['scenes', sceneIndex, 'blocks', blockIndex, 'id'],
          });
        }
        blockIds.add(block.id);
      }
    }
  });

export const sceneSchema = screenplaySceneSchema;

export type ScreenplayBlock = z.infer<typeof screenplayBlockSchema>;
export type Scene = z.infer<typeof screenplaySceneSchema>;
export type ScreenplayDocument = z.infer<typeof screenplayDocumentSchema>;

export interface BlockProjection {
  readonly documentId: string;
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly blockId: string;
  readonly blockIndex: number;
  readonly type: ScreenplayBlock['type'];
  readonly text: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export function projectBlocks(
  input: ScreenplayDocument,
): readonly BlockProjection[] {
  return input.scenes.flatMap((scene, sceneIndex) =>
    scene.blocks.map((block, blockIndex) => ({
      documentId: input.documentId,
      sceneId: scene.id,
      sceneIndex,
      blockId: block.id,
      blockIndex,
      type: block.type,
      text: block.text,
      attributes: block.attributes,
    })),
  );
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
