export interface PaginationRendererManifest {
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly fontFamily: string;
  readonly fontChecksumSha256: string;
  readonly pageWidthPoints: number;
  readonly pageHeightPoints: number;
}

export const canonicalPaginationStatus = 'unselected' as const;
