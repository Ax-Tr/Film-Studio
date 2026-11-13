# ADR-014 — Canonical film, document, and screenplay model

**Status:** Accepted technical baseline; S5 exit evidence pending  
**Date:** 13 November 2026

## Context

The product documents use “film” and “project” for the same production workspace. Creating separate `films` and `projects` tenant roots would duplicate ownership, membership, authorization and sync revision state. The editor also needs stable scene/block identities, Unicode preservation, offline-safe client IDs, reversible deletion, immutable revisions and deterministic ordering without prematurely selecting screenplay page rules or a collaborative-text implementation.

## Decision

1. The existing `films` record is the project aggregate and authorization boundary. “Project” remains a user-facing/product synonym, not a second database tenant.
2. Every film-owned relationship includes `film_id`; same-film/document relationships use composite foreign keys.
3. Clients generate UUIDs for offline-creatable documents, scenes, blocks, versions and mutations.
4. Mutable structured records use positive optimistic `version` values. A write must supply the expected version; stale writes return a stable conflict.
5. Every mutation supplies a unique `operationId`. The server stores its request hash and response; an exact retry returns the original response, while reuse for different input is rejected.
6. Scene identity is independent of order. Active order lives in `document_scene_order`, allowing move, tombstone and restore without replacing the scene UUID.
7. Document versions are immutable, complete screenplay snapshots with a schema version and server-computed SHA-256. Restore will create a new version rather than mutate history.
8. Typed block rows are rebuildable projections of an accepted snapshot. S6 may add per-scene Yjs update history as the incremental collaborative-text authority without changing scene/block IDs.
9. The initial AST has eight structural block types and allows scalar attributes. New block semantics require an additive schema-version migration; unknown arbitrary block types are rejected.
10. Text is preserved exactly. The model does not normalize Unicode, infer language, insert acts, select page dimensions, or transform screenplay content.
11. Document `kind` and BCP-47-shaped `language` are required explicit inputs. No default language or document template is hidden in persistence.
12. Deletion uses tombstones; purge/retention remains a separately approved workflow.

## Consequences

- Web, Android and iOS share stable IDs, schemas and optimistic/idempotent semantics.
- A move updates order/version only and never rewrites a scene identifier.
- Cross-film/document links fail at the database boundary even if application validation is defective.
- Immutable snapshots support audit, export provenance and future recovery.
- Acts, sequences and characters have production tables, but user workflows remain later sprint work.
- Snapshot payload limits, Yjs persistence, sync revisions and conflict recovery belong to S6/S7 and cannot be inferred here.

## References

- [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
- [PostgreSQL 18 row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL 18 JSON types](https://www.postgresql.org/docs/18/datatype-json.html)
