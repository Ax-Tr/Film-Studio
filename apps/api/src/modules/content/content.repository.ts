import type { ScreenplayDocument } from '@film-studio/screenplay-model';

export interface DocumentRecord {
  readonly id: string;
  readonly filmId: string;
  readonly title: string;
  readonly kind: string;
  readonly language: string;
  readonly version: number;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
}

export interface SceneRecord {
  readonly id: string;
  readonly filmId: string;
  readonly documentId: string;
  readonly version: number;
  readonly index: number | null;
  readonly deletedAt: string | null;
}

export interface MutationIdentity {
  readonly operationId: string;
  readonly requestHash: Uint8Array;
  readonly userId: string;
  readonly filmId: string;
}

export interface ContentRepository {
  createDocument(
    mutation: MutationIdentity,
    input: {
      readonly id: string;
      readonly title: string;
      readonly kind: string;
      readonly language: string;
    },
  ): Promise<DocumentRecord>;
  updateDocument(
    mutation: MutationIdentity,
    documentId: string,
    input: {
      readonly expectedVersion: number;
      readonly title?: string | undefined;
      readonly kind?: string | undefined;
      readonly language?: string | undefined;
      readonly archived?: boolean | undefined;
    },
  ): Promise<DocumentRecord>;
  getDocument(
    userId: string,
    filmId: string,
    documentId: string,
  ): Promise<DocumentRecord | undefined>;
  listDocuments(
    userId: string,
    filmId: string,
  ): Promise<readonly DocumentRecord[]>;
  createScene(
    mutation: MutationIdentity,
    documentId: string,
    input: {
      readonly id: string;
      readonly expectedDocumentVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord>;
  moveScene(
    mutation: MutationIdentity,
    documentId: string,
    sceneId: string,
    input: {
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord>;
  deleteScene(
    mutation: MutationIdentity,
    documentId: string,
    sceneId: string,
    expectedDocumentVersion: number,
    expectedSceneVersion: number,
  ): Promise<SceneRecord>;
  restoreScene(
    mutation: MutationIdentity,
    documentId: string,
    sceneId: string,
    input: {
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord>;
  listScenes(
    userId: string,
    filmId: string,
    documentId: string,
    includeDeleted: boolean,
  ): Promise<readonly SceneRecord[]>;
  createDocumentVersion(
    mutation: MutationIdentity,
    documentId: string,
    versionId: string,
    expectedDocumentVersion: number,
    snapshot: ScreenplayDocument,
    snapshotHash: Uint8Array,
  ): Promise<{
    readonly id: string;
    readonly documentId: string;
    readonly documentVersion: number;
    readonly snapshotSha256: string;
  }>;
}
