import {
  createDocumentRequestSchema,
  createDocumentVersionRequestSchema,
  createSceneRequestSchema,
  deleteSceneRequestSchema,
  documentResourceSchema,
  documentVersionResourceSchema,
  moveSceneRequestSchema,
  restoreSceneRequestSchema,
  sceneResourceSchema,
  updateDocumentRequestSchema,
} from '@film-studio/contracts';
import { z } from 'zod';

export interface ApiClientOptions {
  readonly baseUrl: URL;
  readonly getAccessToken?: () => Promise<string | undefined>;
  readonly fetchImplementation?: typeof fetch;
}

export function createApiClient(options: ApiClientOptions) {
  const request = options.fetchImplementation ?? fetch;
  const send = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> => {
    const token = await options.getAccessToken?.();
    const response = await request(new URL(path, options.baseUrl), {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new ApiRequestError(response.status, await response.json());
    }
    return response.status === 204 ? undefined : response.json();
  };

  return {
    async getHealth(): Promise<unknown> {
      const response = await request(new URL('/health', options.baseUrl), {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Health request failed with ${response.status}.`);
      }
      return response.json();
    },
    async createDocument(filmId: string, input: unknown) {
      const body = createDocumentRequestSchema.parse(input);
      return documentResourceSchema.parse(
        await send('POST', `/v1/films/${filmId}/documents`, body),
      );
    },
    async listDocuments(filmId: string) {
      return z
        .array(documentResourceSchema)
        .parse(await send('GET', `/v1/films/${filmId}/documents`));
    },
    async getDocument(filmId: string, documentId: string) {
      return documentResourceSchema.parse(
        await send('GET', `/v1/films/${filmId}/documents/${documentId}`),
      );
    },
    async updateDocument(filmId: string, documentId: string, input: unknown) {
      const body = updateDocumentRequestSchema.parse(input);
      return documentResourceSchema.parse(
        await send(
          'PATCH',
          `/v1/films/${filmId}/documents/${documentId}`,
          body,
        ),
      );
    },
    async createScene(filmId: string, documentId: string, input: unknown) {
      const body = createSceneRequestSchema.parse(input);
      return sceneResourceSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/documents/${documentId}/scenes`,
          body,
        ),
      );
    },
    async listScenes(
      filmId: string,
      documentId: string,
      includeDeleted = false,
    ) {
      return z
        .array(sceneResourceSchema)
        .parse(
          await send(
            'GET',
            `/v1/films/${filmId}/documents/${documentId}/scenes?includeDeleted=${String(includeDeleted)}`,
          ),
        );
    },
    async moveScene(
      filmId: string,
      documentId: string,
      sceneId: string,
      input: unknown,
    ) {
      const body = moveSceneRequestSchema.parse(input);
      return sceneResourceSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/documents/${documentId}/scenes/${sceneId}/move`,
          body,
        ),
      );
    },
    async deleteScene(
      filmId: string,
      documentId: string,
      sceneId: string,
      input: unknown,
    ) {
      const body = deleteSceneRequestSchema.parse(input);
      return sceneResourceSchema.parse(
        await send(
          'DELETE',
          `/v1/films/${filmId}/documents/${documentId}/scenes/${sceneId}`,
          body,
        ),
      );
    },
    async restoreScene(
      filmId: string,
      documentId: string,
      sceneId: string,
      input: unknown,
    ) {
      const body = restoreSceneRequestSchema.parse(input);
      return sceneResourceSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/documents/${documentId}/scenes/${sceneId}/restore`,
          body,
        ),
      );
    },
    async createDocumentVersion(
      filmId: string,
      documentId: string,
      input: unknown,
    ) {
      const body = createDocumentVersionRequestSchema.parse(input);
      return documentVersionResourceSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/documents/${documentId}/versions`,
          body,
        ),
      );
    },
  };
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly envelope: unknown,
  ) {
    super(`API request failed with status ${status}.`);
  }
}
