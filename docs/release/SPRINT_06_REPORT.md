# Sprint 06 — Offline sync and conflict foundation

**Status:** Implementation ready for review; exit gate not yet accepted  
**Date:** 14 November 2026  
**Gate note:** Executed at the product owner's explicit direction while S0–S5 acceptance remains open.

## 1. Delivered

| Area | Delivered evidence | Status |
|---|---|---|
| Server revision allocation | Monotonic per-film `serverRevision` allocated atomically inside database transaction | Complete |
| Transactional ledger | Ordered `operation_ledger` tracking client operations, stable actor/device identities, server revisions and timestamps | Complete |
| Production migration | `0003_offline_sync.sql` introducing `operation_ledger`, `sync_device_sequences`, `sync_device_acks`, `sync_conflicts`, `scene_crdt_updates`, `scene_crdt_snapshots` and RLS | Locally applied; PostgreSQL verified |
| Per-device sequence guard | Strict `(deviceId, clientSequence)` mapping enforcing sequence-operation uniqueness and preventing sequence reuse attacks | Complete |
| Idempotent replay | Exact retries of existing `opId` return `already_applied` or prior conflict status without re-executing | Complete |
| Structured conflicts | Field-level conflict engine separating safe disjoint merges from conflicting field edits (`SAME_FIELD_CHANGED`) | Complete |
| Delete-versus-edit | Offline modifications to tombstoned/deleted entities create explicit `DELETE_VS_EDIT` conflict with preserved recovery branch | Complete |
| Future base version | Stale future versions rejected with explicit `FUTURE_BASE_VERSION` error code | Complete |
| Bounded pull & cursors | Bounded, cursor-based operation feed with opaque base64url tamper-resistant cursor tokens and `hasMore` pagination | Complete |
| Monotonic device ack | `sync_device_acks` recording per-device sync progression monotonically | Complete |
| Compaction safety | Safe compaction floor calculation preventing active device stranding; pull below floor triggers `snapshot_required` (HTTP 410 protocol contract) | Complete |
| Conflict resolution | Explicit conflict resolution API supporting `keep_local`, `keep_remote`, `merge` and `save_alternative` | Complete |
| Authorization & RLS | Every sync push, pull, ack and conflict resolution requires active film membership and role permissions; RLS denies cross-tenant leakage | Negative tests pass |
| Shared client & contracts | `@film-studio/contracts`, `@film-studio/sync-core` and `@film-studio/api-client` updated with typed DTOs and client methods | Complete |

## 2. Verified local evidence

1. The ordered migration suite (0001, 0002, 0003) applies cleanly from an empty database.
2. `PostgresSyncRepository` executes under `NOLOGIN NOBYPASSRLS` runtime role (`app_sync_runtime`).
3. Valid document operations allocate monotonic revision numbers (1, 2, 3...) per film and advance document versions.
4. Identical `opId` retry returns `already_applied` with original `serverRevision`.
5. Reused `(deviceId, clientSequence)` with different `opId` is rejected with `DEVICE_SEQUENCE_REUSE`.
6. Stale base version with disjoint field edits is safely merged without creating a false conflict.
7. Stale base version with same field edited to differing value generates an explicit `SAME_FIELD_CHANGED` conflict record.
8. Offline edit to a deleted scene creates a `DELETE_VS_EDIT` conflict record preserving the client payload.
9. Operations with base versions ahead of server state are rejected with `FUTURE_BASE_VERSION`.
10. Bounded pull returns operations ordered by server revision and generates a valid opaque next cursor.
11. Compaction floor cannot advance beyond the minimum active device acknowledgement; pull below floor returns `snapshot_required`.
12. Conflict resolution records resolution strategy (`keep_remote`, `merge`) and resolver identity.
13. RLS prevents a user from Film B from reading or pushing operations to Film A.
14. Complete repository verification `pnpm check` passes cleanly (secrets check, boundaries check, lint, build, typecheck, migration test, canonical model test, sync protocol test, and 51 unit/contract tests).

## 3. CTO decisions

1. REST pull is the source of truth for synchronization; WebSocket/push is an optional latency accelerator.
2. Every synchronizable write passes through the transactional operation ledger with an atomic film revision bump.
3. Client operations use client-generated UUIDs and per-device sequences. Sequence reuse with differing operation ID is immediately rejected.
4. Structured conflicts never use blind last-write-wins (LWW); disjoint fields merge safely while concurrent same-field modifications trigger explicit conflict records.
5. Deletion is soft (tombstone) to allow offline clients to detect and preserve delete-versus-edit recovery branches.
6. Compaction floor protects slow or temporarily offline devices whose last acknowledged revision is above the floor; devices falling below compaction floor are directed to full snapshot resynchronization.
7. Every push, pull, ack, and conflict operation re-evaluates server-side authorization and respects database RLS.

