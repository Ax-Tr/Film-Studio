export * from './paginator.js';
export * from './importer.js';
export * from './exporter.js';

export interface PaginationRendererManifest {
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly fontFamily: string;
  readonly fontChecksumSha256: string;
  readonly pageWidthPoints: number;
  readonly pageHeightPoints: number;
}

export const canonicalPaginationStatus = 'ready' as const;
