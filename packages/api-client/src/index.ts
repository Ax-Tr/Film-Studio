import {
  acknowledgeSyncRevisionRequestSchema,
  createDocumentRequestSchema,
  createDocumentVersionRequestSchema,
  createFilmRequestSchema,
  createSceneRequestSchema,
  deleteSceneRequestSchema,
  documentResourceSchema,
  documentVersionResourceSchema,
  filmResourceSchema,
  moveSceneRequestSchema,
  pullSyncOperationsRequestSchema,
  pullSyncOperationsResponseSchema,
  pushSyncOperationsRequestSchema,
  pushSyncOperationsResponseSchema,
  resolveConflictRequestSchema,
  restoreSceneRequestSchema,
  sceneResourceSchema,
  syncConflictSchema,
  updateDocumentRequestSchema,
  characterResourceSchema,
  createCharacterSchema,
  updateCharacterSchema,
  characterRelationshipSchema,
  sceneCardResourceSchema,
  reorderScenesSchema,
  lockSceneSchema,
  globalSearchResponseSchema,
  documentVersionSummaryResourceSchema,
  documentVersionDetailResourceSchema,
  restoreDocumentVersionRequestSchema,
  importScriptRequestSchema,
  importScriptResponseSchema,
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
    async getMe(): Promise<unknown> {
      return send('GET', '/me/session');
    },
    async listFilms() {
      return z.array(filmResourceSchema).parse(await send('GET', '/films'));
    },
    async getFilm(filmId: string) {
      return filmResourceSchema.parse(await send('GET', `/films/${filmId}`));
    },
    async createFilm(organizationId: string, input: unknown) {
      const body = createFilmRequestSchema.parse(input);
      return filmResourceSchema.parse(
        await send('POST', `/organizations/${organizationId}/films`, body),
      );
    },
    async archiveFilm(filmId: string) {
      await send('POST', `/films/${filmId}/archive`);
    },
    async restoreFilm(filmId: string) {
      await send('POST', `/films/${filmId}/restore`);
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
    async listDocumentVersions(filmId: string, documentId: string) {
      return z
        .array(documentVersionSummaryResourceSchema)
        .parse(
          await send(
            'GET',
            `/v1/films/${filmId}/documents/${documentId}/versions`,
          ),
        );
    },
    async getDocumentVersion(
      filmId: string,
      documentId: string,
      versionId: string,
    ) {
      return documentVersionDetailResourceSchema.parse(
        await send(
          'GET',
          `/v1/films/${filmId}/documents/${documentId}/versions/${versionId}`,
        ),
      );
    },
    async restoreDocumentVersion(
      filmId: string,
      documentId: string,
      versionId: string,
      input: unknown,
    ) {
      const body = restoreDocumentVersionRequestSchema.parse(input);
      return documentVersionDetailResourceSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/documents/${documentId}/versions/${versionId}/restore`,
          body,
        ),
      );
    },
    async importScript(filmId: string, input: unknown) {
      const body = importScriptRequestSchema.parse(input);
      return importScriptResponseSchema.parse(
        await send('POST', `/v1/films/${filmId}/documents/import`, body),
      );
    },
    async exportDocument(
      filmId: string,
      documentId: string,
      exportOptions?: {
        format?: 'pdf' | 'fountain';
        versionId?: string;
        watermark?: string;
      },
    ): Promise<{ contentType: string; data: ArrayBuffer | string }> {
      const params = new URLSearchParams();
      if (exportOptions?.format) params.set('format', exportOptions.format);
      if (exportOptions?.versionId) params.set('versionId', exportOptions.versionId);
      if (exportOptions?.watermark) params.set('watermark', exportOptions.watermark);
      const token = await options.getAccessToken?.();
      const url = new URL(
        `/v1/films/${filmId}/documents/${documentId}/export?${params.toString()}`,
        options.baseUrl,
      );
      const res = await request(url, {
        method: 'GET',
        headers: {
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
      });
      if (!res.ok) {
        throw new ApiRequestError(res.status, await res.text());
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('pdf')) {
        return { contentType, data: await res.arrayBuffer() };
      }
      return { contentType, data: await res.text() };
    },
    async pushSync(input: unknown) {
      const body = pushSyncOperationsRequestSchema.parse(input);
      return pushSyncOperationsResponseSchema.parse(
        await send('POST', '/v1/sync/push', body),
      );
    },
    async pullSync(filmId: string, query?: { cursor?: string; limit?: number }) {
      const parsed = pullSyncOperationsRequestSchema.parse({
        filmId,
        ...query,
      });
      const params = new URLSearchParams({ filmId: parsed.filmId });
      if (parsed.cursor) params.set('cursor', parsed.cursor);
      if (parsed.limit) params.set('limit', String(parsed.limit));
      return pullSyncOperationsResponseSchema.parse(
        await send('GET', `/v1/sync/pull?${params.toString()}`),
      );
    },
    async ackSync(input: unknown) {
      const body = acknowledgeSyncRevisionRequestSchema.parse(input);
      await send('POST', '/v1/sync/ack', body);
    },
    async listConflicts(filmId: string) {
      const result = await send('GET', `/v1/films/${filmId}/conflicts`);
      return z.array(syncConflictSchema).parse(result);
    },
    async resolveConflict(
      filmId: string,
      conflictId: string,
      input: unknown,
    ) {
      const body = resolveConflictRequestSchema.parse(input);
      return syncConflictSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/conflicts/${conflictId}/resolve`,
          body,
        ),
      );
    },
    async createCharacter(filmId: string, input: unknown) {
      const body = createCharacterSchema.parse(input);
      return characterResourceSchema.parse(
        await send('POST', `/v1/films/${filmId}/characters`, body),
      );
    },
    async listCharacters(filmId: string) {
      const result = await send('GET', `/v1/films/${filmId}/characters`);
      return z.array(characterResourceSchema).parse(result);
    },
    async getCharacter(filmId: string, characterId: string) {
      const result = await send('GET', `/v1/films/${filmId}/characters/${characterId}`);
      return characterResourceSchema.parse(result);
    },
    async updateCharacter(filmId: string, characterId: string, input: unknown) {
      const body = updateCharacterSchema.parse(input);
      return characterResourceSchema.parse(
        await send('PATCH', `/v1/films/${filmId}/characters/${characterId}`, body),
      );
    },
    async deleteCharacter(filmId: string, characterId: string) {
      await send('DELETE', `/v1/films/${filmId}/characters/${characterId}`);
    },
    async addCharacterRelationship(
      filmId: string,
      characterId: string,
      targetCharacterId: string,
      relationshipType: string,
      description?: string,
    ) {
      return characterRelationshipSchema.parse(
        await send(
          'POST',
          `/v1/films/${filmId}/characters/${characterId}/relationships`,
          { targetCharacterId, relationshipType, description },
        ),
      );
    },
    async listCharacterRelationships(filmId: string, characterId: string) {
      const result = await send(
        'GET',
        `/v1/films/${filmId}/characters/${characterId}/relationships`,
      );
      return z.array(characterRelationshipSchema).parse(result);
    },
    async listSceneCards(filmId: string, documentId: string) {
      const result = await send(
        'GET',
        `/v1/films/${filmId}/documents/${documentId}/scene-cards`,
      );
      return z.array(sceneCardResourceSchema).parse(result);
    },
    async reorderScenes(filmId: string, documentId: string, sceneIdsInOrder: string[]) {
      const body = reorderScenesSchema.parse({ documentId, sceneIdsInOrder });
      await send(
        'PUT',
        `/v1/films/${filmId}/documents/${documentId}/scenes/reorder`,
        body,
      );
    },
    async updateSceneMetadata(
      filmId: string,
      documentId: string,
      sceneId: string,
      meta: {
        slugline?: string;
        timeOfDay?: string;
        settingLocation?: string;
        summary?: string;
      },
    ) {
      await send(
        'PATCH',
        `/v1/films/${filmId}/documents/${documentId}/scenes/${sceneId}/metadata`,
        meta,
      );
    },
    async lockScene(
      filmId: string,
      documentId: string,
      sceneId: string,
      lock: boolean,
    ) {
      const body = lockSceneSchema.parse({ lock });
      await send(
        'POST',
        `/v1/films/${filmId}/documents/${documentId}/scenes/${sceneId}/lock`,
        body,
      );
    },
    async globalSearch(filmId: string, query: string) {
      const params = new URLSearchParams({ q: query });
      return globalSearchResponseSchema.parse(
        await send('GET', `/v1/films/${filmId}/search?${params.toString()}`),
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
