# STORYFORGE STUDIO — API and Contract Conventions

**Status:** S2 baseline  
**Date:** 13 November 2026

## 1. Contract authority

- `packages/contracts` Zod/JSON schemas are the implementation source for network request/response/event validation.
- OpenAPI 3.1 is generated, committed and compatibility-diffed from those schemas/Nest route metadata.
- SQL migrations are authoritative for persistence, not for public JSON shape.
- Generated TypeScript API clients are consumed by web/mobile; handwritten duplicate response types are prohibited.
- CI fails on generated-contract drift or an unapproved breaking change.

## 2. Resource and naming rules

- Base path `/v1`; JSON uses `camelCase`; database uses `snake_case`.
- IDs are UUIDs. Offline-creatable entities accept a client-generated UUID.
- Timestamps are UTC RFC 3339/ISO-8601 strings; client timestamps never determine canonical ordering.
- Language values use BCP-47 tags.
- Money uses integer minor units plus ISO currency code; never floating point.
- Entity `version` handles optimistic concurrency; film `serverRevision` orders sync.

## 3. Authentication and authorization

- Mobile uses bearer access token obtained through OIDC Authorization Code + PKCE; browser uses secure BFF session cookie.
- API derives user/device/tenant from verified session; request body identifiers do not prove authority.
- Every route declares permission, resource resolver and audit classification.
- `403` is genuine known-resource denial where disclosure is acceptable; otherwise use tenant-safe `404` consistently.

## 4. Idempotency and concurrency

- `Idempotency-Key` is required for create, invite, export/import/AI jobs, conflict resolution and sync push.
- Key scope includes authenticated principal, route and film. Same key plus different canonical request hash returns `409 IDEMPOTENCY_KEY_REUSED`.
- Store terminal response/outcome for the policy retention window.
- Structured update requires `If-Match`/`baseVersion`. A conflict returns stable `conflictId`, not an overwritten resource.

## 5. Standard response behavior

- Success uses the resource/status appropriate to the operation (`200`, `201`, `202`, `204`).
- Asynchronous requests return `202` with job resource and polling/realtime status.
- No secret/provider key/token appears in a normal resource response unless it is the one-time native token issuance flow.
- Lists use cursor pagination with bounded `limit`, `items`, `nextCursor`, `hasMore` where applicable.

Error envelope:

```json
{
  "code": "SCENE_VERSION_CONFLICT",
  "message": "The scene changed on another device.",
  "requestId": "opaque-support-id",
  "retryable": false,
  "details": {},
  "conflictId": "uuid"
}
```

`message` is safe/localizable; `details` follows an allowlisted schema and never exposes stack trace, SQL, secret or unauthorized remote content.

## 6. Retry and rate limits

- `429` includes `Retry-After` and a safe quota code.
- Retryable `5xx` includes stable request ID. Client retries only idempotent methods or requests carrying a reusable idempotency key/op ID.
- Limits exist per IP/account/device/film/operation; AI/export/import have cost/queue limits separate from typing/sync.

## 7. Deletes and recovery

- User content delete normally creates a tombstone and recovery metadata.
- Permanent purge is a separate authorized workflow after retention/legal-hold checks.
- Offline clients receive tombstones via sync.
- Restore creates a new version and audit event.

## 8. Files

1. Request scoped upload intent with filename, declared MIME, size and checksum.
2. Upload to quarantine through short-lived signed URL.
3. Verify size/checksum/MIME and scan/parse in bounded worker.
4. Promote immutable object version or reject/quarantine.
5. Download URL is issued only after current permission check; it is short-lived and content-disposition safe.

## 9. Realtime

- `/v1/realtime` authenticates with a short-lived token/session and reauthorizes film-room joins.
- Event envelopes include schema version, event ID, film ID, server revision when authoritative, type and payload.
- Presence is ephemeral; no WS event replaces REST sync/pull.
- Unknown event schema is ignored safely and triggers authoritative pull where relevant.

## 10. Compatibility

- Additive fields are optional for older clients; enums require an unknown-safe client strategy where future extension is expected.
- Breaking changes require a new version or documented mobile support-window migration.
- Database deploys use expand/backfill/contract and remain compatible with supported installed mobile versions.

