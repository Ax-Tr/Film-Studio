import type { createApiClient } from '@film-studio/api-client';
import type { DocumentResource, SceneResource } from '@film-studio/contracts';
import type { ScreenplayDocument } from '@film-studio/screenplay-model';

export interface NativeCanonicalModelCompatibility {
  readonly client: ReturnType<typeof createApiClient>;
  readonly document: DocumentResource;
  readonly scenes: readonly SceneResource[];
  readonly snapshot: ScreenplayDocument;
}
