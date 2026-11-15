import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/index.js';

const filmId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const documentId = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const operationId = '018f4ce4-a249-79aa-94a6-09195b7d91cf';

describe('S5 API client', () => {
  it('validates input and output against shared document contracts', async () => {
    let receivedAuthorization: string | null = null;
    const client = createApiClient({
      baseUrl: new URL('https://api.example.test'),
      getAccessToken: async () => 'opaque-access-token-value-1234567890',
      fetchImplementation: async (input, init) => {
        receivedAuthorization = new Headers(init?.headers).get('authorization');
        expect(String(input)).toBe(
          `https://api.example.test/v1/films/${filmId}/documents`,
        );
        return new Response(
          JSON.stringify({
            id: documentId,
            filmId,
            title: 'Screenplay',
            kind: 'screenplay',
            language: 'te-IN',
            version: 1,
            archivedAt: null,
            deletedAt: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await client.createDocument(filmId, {
      operationId,
      id: documentId,
      title: 'Screenplay',
      kind: 'screenplay',
      language: 'te-IN',
    });
    expect(result.id).toBe(documentId);
    expect(receivedAuthorization).toBe(
      'Bearer opaque-access-token-value-1234567890',
    );
  });

  it('rejects an invalid language before sending a request', async () => {
    let called = false;
    const client = createApiClient({
      baseUrl: new URL('https://api.example.test'),
      fetchImplementation: async () => {
        called = true;
        return new Response();
      },
    });
    await expect(
      client.createDocument(filmId, {
        operationId,
        id: documentId,
        title: 'Screenplay',
        kind: 'screenplay',
        language: 'not a language tag',
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('validates pushSync, pullSync, and ackSync request/response contracts', async () => {
    const client = createApiClient({
      baseUrl: new URL('https://api.example.test'),
      fetchImplementation: async (input) => {
        const url = String(input);
        if (url.includes('/sync/push')) {
          return new Response(
            JSON.stringify({
              filmId,
              results: [
                {
                  opId: operationId,
                  status: 'applied',
                  serverRevision: 1,
                  entityVersion: 2,
                },
              ],
              latestServerRevision: 1,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/sync/pull')) {
          return new Response(
            JSON.stringify({
              kind: 'operations',
              operations: [],
              nextCursor: 'opaque-cursor',
              hasMore: false,
              latestServerRevision: 1,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/sync/ack')) {
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 404 });
      },
    });

    const pushRes = await client.pushSync({
      filmId,
      operations: [
        {
          schemaVersion: 1,
          opId: operationId,
          filmId,
          actorUserId: '018f4ce4-7a86-7f2e-96df-bf4e914f21d4',
          deviceId: '018f4ce4-f001-7000-8000-000000000001',
          clientSequence: 1,
          entityType: 'document',
          entityId: documentId,
          kind: 'document.metadata.patch',
          baseVersion: 1,
          payload: { title: 'Updated' },
          createdAtClient: new Date().toISOString(),
        },
      ],
    });
    expect(pushRes.results).toHaveLength(1);
    expect(pushRes.results[0]?.status).toBe('applied');

    const pullRes = await client.pullSync(filmId);
    expect(pullRes.kind).toBe('operations');

    await expect(
      client.ackSync({
        filmId,
        deviceId: '018f4ce4-f001-7000-8000-000000000001',
        serverRevision: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
