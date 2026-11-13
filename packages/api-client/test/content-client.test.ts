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
});
