import type { ScreenplayBlockJson } from './schema';
import { typeByNodeName } from './schema';

export interface SceneNavigationItem {
  readonly sceneId: string;
  readonly sceneNumber: number;
  readonly heading: string;
  readonly blockCount: number;
  readonly wordCount: number;
  readonly firstBlockId: string;
}

export function extractSceneNavigation(
  blocks: readonly ScreenplayBlockJson[],
): readonly SceneNavigationItem[] {
  const scenes: SceneNavigationItem[] = [];
  let currentScene: {
    sceneId: string;
    sceneNumber: number;
    heading: string;
    blockCount: number;
    wordCount: number;
    firstBlockId: string;
  } | null = null;

  for (const block of blocks) {
    const blockType = block.attrs?.blockType || typeByNodeName[block.type];
    const text = block.content?.map((c) => c.text).join('') ?? '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    if (blockType === 'scene_heading') {
      const sceneId = block.attrs?.sceneId || block.attrs?.blockId;
      const sceneNumber = block.attrs?.sceneNumber ?? scenes.length + 1;

      currentScene = {
        sceneId,
        sceneNumber,
        heading: text || `SCENE ${sceneNumber}`,
        blockCount: 1,
        wordCount: words,
        firstBlockId: block.attrs?.blockId,
      };
      scenes.push(currentScene);
    } else {
      if (!currentScene) {
        // Blocks before first heading belong to prologue / scene 1
        currentScene = {
          sceneId: block.attrs?.sceneId || block.attrs?.blockId,
          sceneNumber: 1,
          heading: 'SCENE 1 (PROLOGUE)',
          blockCount: 0,
          wordCount: 0,
          firstBlockId: block.attrs?.blockId,
        };
        scenes.push(currentScene);
      }
      currentScene.blockCount += 1;
      currentScene.wordCount += words;
    }
  }

  return scenes;
}

