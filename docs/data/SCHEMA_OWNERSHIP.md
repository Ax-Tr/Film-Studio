# STORYFORGE STUDIO — Schema and Data Ownership

**Status:** S2 baseline  
**Date:** 13 November 2026

## 1. Sources of truth

| Concern | Authority |
|---|---|
| Public HTTP/event shape | `packages/contracts` schemas; generated OpenAPI/clients |
| Business invariants/permissions | `packages/domain` and server policy modules |
| Screenplay AST/block migrations | `packages/screenplay-model` |
| Sync operation/conflict/cursor rules | `packages/sync-core` |
| Persistent structure/constraints | Reviewed PostgreSQL migrations |
| Local replica structure | Versioned web/mobile storage migrations derived from domain/sync contracts |
| Pagination/layout manifest | Versioned pagination package and pinned font/renderer manifest |

No UI, controller, ORM entity or worker creates an alternative domain definition.

## 2. Domain ownership

| Module owner | Canonical entities/tables |
|---|---|
| Identity | users, auth identities, devices, sessions, recovery/MFA metadata |
| Film administration | films/projects, memberships, roles, permissions, invitations, ownership transfers |
| Story/document | documents, immutable versions, acts, sequences, scenes, blocks/projections, beats/threads/timelines |
| Character | characters, aliases, relationships, appearances, arcs |
| Sync/collaboration | operations, cursors, conflicts, Yjs updates/snapshots, comments, annotations, approvals |
| Continuity | facts, links, issues, exceptions |
| Files/import/export | assets, upload intents, import/export jobs/files, deletion state |
| AI | provider configurations, consent manifests, requests, responses/proposals, usage |
| Production | locations/elements, breakdowns, schedules/items, assumptions |
| Budget | rate cards, items, versions/approvals |
| Audit/operations | audit events, backups, restore/deletion jobs, quotas/feature policy |

## 3. Tenant and identity invariants

- Every film-owned table has `film_id` and `(film_id, id)` uniqueness where cross-table tenant-safe FKs need it.
- Same-film relationships use composite foreign keys or an equally strong database constraint.
- Film owner is an active membership with exactly one accountable owner at a time; transfer is transactional.
- Device/session ownership is database-enforced.
- Client-supplied `filmId` never changes the film resolved from the target resource.
- RLS/scoped repositories use server-set tenant context; integration tests prove fail-closed behavior.

## 4. Version and deletion rules

- Structured mutable entity: positive `version`, updated on accepted canonical change.
- Film: monotonic `server_revision`, allocated transactionally for sync-visible writes.
- Immutable document version: never edited; restore creates another version.
- User-deletable content: tombstone/`deleted_at` plus recovery metadata; purge is a separate workflow.
- Field conflict history is retained sufficiently to prove whether a stale patch overlaps.
- `updated_at` is database/application consistent and tested; it is not a concurrency token.

## 5. Canonical versus projection data

| Data | Canonical | Rebuildable projection |
|---|---:|---:|
| Yjs scene update/snapshot history | Yes | No |
| Scene block/search representation | No | Yes |
| Character appearances/dialogue counts | No | Yes |
| Continuity issue from deterministic rules | Versioned result/evidence | Recomputable under rule version |
| Search tokens/embeddings | No | Yes; delete with source policy |
| Export file | Versioned artifact with provenance | Regenerable if inputs/renderer retained |
| AI response/proposal | Historical record under retention policy | Never canonical screenplay until accepted operation |

Projection jobs are idempotent, keyed by accepted source revision and safe to rebuild without mutating canonical history.

## 6. Migration policy

- Forward migrations use expand → deploy compatible code → backfill/verify → contract after mobile support window.
- One migrator lock; migration checksum/provenance recorded.
- Rehearse on production-like snapshot, measure locks/backfill and test restore.
- No destructive column/table contract while supported clients/workers depend on it.
- Local replicas migrate transactionally and keep an export/recovery path on failure.
- Every contract/schema change has compatibility test and rollback/roll-forward runbook.

## 7. Required remediation of `001_core.sql`

- Split proposal into ordered migrations.
- Add roles/permissions/invitations and remove billing-specific entitlement assumptions.
- Add RLS/scoped access policies and negative tests.
- Enforce actor/device membership, film owner invariant and document/act/sequence/scene consistency.
- Replace polymorphic production element link with typed link tables or database-enforced discriminator strategy.
- Add versions/tombstones consistently to synchronizable entities.
- Add retention/deletion/import/knowledge/approval entities before their modules ship.
- Execute against the pinned PostgreSQL version; static DDL remains non-production evidence.

