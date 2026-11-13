# STORYFORGE STUDIO — Authoritative Offline Sync and Conflict Protocol

**Status:** S2 contract baseline  
**Date:** 13 November 2026

## 1. Invariants

1. Local content and outbox operation commit in one durable local transaction before “Saved locally.”
2. “Synced” appears only after authoritative server acknowledgement and required pull/apply.
3. Retrying the same `opId` never duplicates a mutation, scene, export or AI charge.
4. A `(deviceId, clientSequence)` value maps to exactly one `opId`.
5. Every server mutation receives a monotonically increasing film `serverRevision` in the same transaction.
6. REST pull is authoritative; realtime events only reduce latency.
7. Structured conflicts never use blind last-write-wins.
8. Text convergence does not imply narrative approval; history/review remains available.
9. Revocation prevents network access but does not silently destroy unsent local work.
10. Delete-versus-offline-edit preserves a recoverable branch.

## 2. Client operation envelope

```json
{
  "schemaVersion": 1,
  "opId": "uuid",
  "filmId": "uuid",
  "actorUserId": "uuid",
  "deviceId": "uuid",
  "clientSequence": 148,
  "entityType": "scene",
  "entityId": "uuid",
  "kind": "scene.metadata.patch",
  "baseVersion": 12,
  "payload": { "timeOfDay": "NIGHT" },
  "createdAtClient": "ISO-8601"
}
```

`actorUserId` is useful for diagnostics/signing but is never trusted over the authenticated session. The server binds the session user, device and target film. CRDT updates carry bounded binary/base64 data and a scene ID; they cannot smuggle arbitrary structured mutations.

## 3. Client state machine

```text
draft change
  -> local transaction(state + outbox)
  -> saved_local
  -> queued
  -> sending
      -> acknowledged -> pulling -> applying -> synced
      -> conflict -> needs_review
      -> rejected_permission -> retained_local_locked
      -> retryable_error -> queued(backoff)
      -> permanent_validation_error -> needs_repair
```

Process termination at any arrow resumes from durable local state. A cursor advances only after the pulled page is fully applied in a local transaction.

## 4. Push algorithm

For a bounded batch, the server:

1. Authenticates session/device and loads active film membership/effective permissions.
2. Validates request/operation schema, sizes, sequence, target existence and film match.
3. Looks up `opId`. If terminal result already exists, returns the stored result as `already_applied` or the original conflict/rejection.
4. Rejects reuse of `(deviceId, clientSequence)` for a different operation.
5. Locks/allocates the film revision in a database transaction.
6. Applies CRDT update or structured conflict policy.
7. Writes canonical mutation, operation ledger, projections/outbox events and audit outcome atomically.
8. Returns per-operation status; one bad operation does not erase other independently valid results unless the documented operation group is explicitly atomic.

## 5. Structured concurrency

Every mutable structured entity has `version`; synchronizable fields have sufficient change history/field revision to prove whether a stale patch overlaps.

| Situation | Result |
|---|---|
| Base current | Apply and increment entity/film revisions |
| Stale base, disjoint fields unchanged since base | Safe merge, record applied patch |
| Stale base, same field changed to different value | Create explicit conflict with base/local/remote |
| Same desired value already canonical | Record idempotent/no-op result according to operation policy |
| Future/unknown base | Reject protocol error; resync |
| Target tombstoned, offline edit arrives | `DELETE_VS_EDIT` conflict with recoverable local branch |
| Concurrent scene moves | Serialize relative move against stable IDs; incompatible placement becomes conflict |
| Restore older draft | Create a new immutable version; never overwrite unseen newer work |

## 6. CRDT text

- One Yjs document per scene.
- Update is authorized against film/scene on every push and WS frame.
- Updates are size/rate limited and decoded before persistence.
- `opId` uniquely identifies stored update; duplicate application is harmless but still deduplicated operationally.
- Snapshots store state vector, Yjs state, schema version and `uptoServerRevision`.
- Queryable screenplay blocks are versioned projections; Yjs history is not bypassed by direct projection writes.
- Document migration is explicit and tested across supported client versions.

## 7. Pull and acknowledgement

`GET /sync/pull?filmId=...&cursor=...&limit=...` returns ordered accepted operations/tombstones, `nextCursor`, `hasMore`, latest revision and optional snapshot instruction. Cursor tokens are opaque, film/device-bound and tamper-protected.

Client applies a page transactionally, persists new materialized state and dedupe IDs, then advances the local cursor. Only afterward does it `POST /sync/ack`. Ack is monotonic and never authorizes data access.

## 8. Compaction and stale devices

- Never discard history needed by an active supported device cursor.
- Compact Yjs updates into a verified snapshot; keep replay cutoff and state vector.
- Structured operation retention follows approved recovery/audit policy.
- A device beyond the supported offline window is explicitly retired under policy, not silently ignored.
- Pull below the compaction floor returns `snapshot_required`/HTTP 410 with authenticated snapshot instructions.
- Unsent local operations remain exportable/reconcilable after snapshot replacement.

## 9. Permission changes and revoked membership

- Reauthorize every push, pull, ack, WS join/rejoin, file/export/AI job.
- On revocation: reject sync, close rooms, invalidate signed URLs where practical and prevent new jobs.
- Client locks canonical film access and retains encrypted unsent work only for the owner-approved recovery window.
- Recovery does not grant the former member a general export right. It produces a limited encrypted package or owner-mediated reconciliation according to policy.

## 10. Retry rules

- Retry network errors, `408`, `429` and documented transient `5xx` with exponential backoff, jitter and server `Retry-After`.
- Do not automatically retry validation, membership, conflict or consent errors as if successful.
- Reuse the same `opId` and idempotency key for the same logical attempt.
- Never create a new `opId` merely because the response was lost.

## 11. Required verification

The executable S2 reference model covers idempotency, sequence reuse, field conflicts, delete/edit, revocation, cursors and compaction safety. Production tests add real PostgreSQL transactions, multi-process concurrency, Yjs persistence, device databases and network fault injection.

