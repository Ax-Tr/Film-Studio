import type { SceneNavigationItem } from './navigator';

export interface VirtualSlice {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalHeight: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly visibleScenes: readonly SceneNavigationItem[];
}

export interface VirtualizationOptions {
  readonly estimatedBlockHeight?: number;
  readonly sceneHeaderHeight?: number;
  readonly overscan?: number;
}

export function computeVirtualSlice(
  scenes: readonly SceneNavigationItem[],
  scrollTop: number,
  viewportHeight: number,
  options: VirtualizationOptions = {},
): VirtualSlice {
  const estimatedBlockHeight = options.estimatedBlockHeight ?? 24;
  const sceneHeaderHeight = options.sceneHeaderHeight ?? 48;
  const overscan = options.overscan ?? 2;

  if (scenes.length === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      totalHeight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      visibleScenes: [],
    };
  }

  // Calculate approximate height and position for each scene
  const sceneHeights = scenes.map(
    (scene) => sceneHeaderHeight + scene.blockCount * estimatedBlockHeight,
  );

  const sceneOffsets: number[] = [];
  let currentOffset = 0;
  for (const height of sceneHeights) {
    sceneOffsets.push(currentOffset);
    currentOffset += height;
  }
  const totalHeight = currentOffset;

  // Find start and end indices based on viewport
  const viewBottom = scrollTop + viewportHeight;

  let rawStart = 0;
  for (let i = 0; i < sceneOffsets.length; i++) {
    const top = sceneOffsets[i] ?? 0;
    const height = sceneHeights[i] ?? 0;
    if (top + height >= scrollTop) {
      rawStart = i;
      break;
    }
  }

  let rawEnd = rawStart;
  for (let i = rawStart; i < sceneOffsets.length; i++) {
    const top = sceneOffsets[i] ?? 0;
    rawEnd = i;
    if (top >= viewBottom) {
      break;
    }
  }

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(scenes.length - 1, rawEnd + overscan);

  const paddingTop = sceneOffsets[startIndex] ?? 0;
  const endOffset = (sceneOffsets[endIndex] ?? 0) + (sceneHeights[endIndex] ?? 0);
  const paddingBottom = Math.max(0, totalHeight - endOffset);

  const visibleScenes = scenes.slice(startIndex, endIndex + 1);

  return {
    startIndex,
    endIndex,
    totalHeight,
    paddingTop,
    paddingBottom,
    visibleScenes,
  };
}

