# Sprint 05 — Canonical projects, documents, and screenplay model

**Status:** Implementation ready for review; exit gate not yet accepted  
**Date:** 13 November 2026  
**Gate note:** Executed at the product owner's explicit direction while S0–S4 acceptance remains open.

## 1. Delivered

| Area                 | Delivered evidence                                                                                                                       | Status                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Project boundary     | Existing Film is the single project/tenant aggregate; no duplicate project ownership model                                               | Complete                                    |
| Production migration | Ordered migration for documents, immutable versions, acts, sequences, scenes, ordering, projections, characters and mutation idempotency | Locally applied; real PostgreSQL pending    |
| Tenant integrity     | Composite film/document foreign keys, scene hierarchy trigger and RLS policies                                                           | Repository negative test passes             |
| Screenplay AST       | Versioned strict Zod model, eight typed blocks, stable client UUIDs, duplicate-ID rejection and exact multilingual Unicode preservation  | Five model tests pass                       |
| Versions/projections | Immutable complete snapshots, server SHA-256 and rebuildable typed block projections                                                     | Integration test passes                     |
| Optimistic writes    | Positive document/scene versions with stable conflict errors                                                                             | Integration test passes                     |
| Idempotency          | Client operation ID, semantic request hash and stored response; changed reuse rejected                                                   | Integration test passes                     |
| Scene lifecycle      | Indexed create/move, tombstone/delete and restore with unchanged scene ID                                                                | Integration test passes                     |
| API                  | Authenticated document and scene lifecycle endpoints with permission/audit enforcement                                                   | Build/typecheck complete                    |
| Shared client        | Contract-validating API client plus web and Expo compile-time compatibility fixtures                                                     | Two client tests and target typechecks pass |

## 2. Verified local evidence

1. Both ordered migrations apply from an empty database.
2. The actual `PostgresContentRepository` runs through the installed node-postgres adapter under a `NOLOGIN NOBYPASSRLS` runtime role.
3. An identical mutation retry returns its original resource; reuse of its operation ID with changed input is rejected.
4. Document update advances the optimistic version and a stale version is rejected.
5. Scene create/move/delete/restore preserves the scene UUID and produces deterministic active ordering.
6. A version snapshot must match the active scene order, stores a SHA-256, creates typed projections and cannot be updated.
7. A user from another film cannot read the document; listing returns only the caller's active film.
8. Telugu, Tamil, Kannada, Bengali and Hindi text is parsed without normalization or mutation.
9. Web and Expo typecheck against the same document, scene, AST and API-client contracts.
10. The complete sequential `pnpm check` gate passes, including production builds, both database suites and 39 unit/contract tests.
11. `pnpm install --frozen-lockfile --offline` passes. The production dependency audit reports zero high/critical findings and the previously recorded single moderate build-tool finding.

## 3. CTO decisions

1. Film and project are one aggregate; “project” is a product synonym.
2. Document kind and language are required inputs and have no hidden default.
3. UUID resource/operation identifiers are client-generated for future offline creation.
4. Ordering is a separate canonical relation, not encoded in scene identity.
5. Expected-version conflicts are explicit; last-write-wins is not used.
6. Exact operation retries are idempotent; changed reuse is a conflict.
7. Document versions are immutable complete snapshots; restore creates a new version.
8. Block rows are projections. S6 can introduce Yjs as incremental text authority without changing identities.
9. New permission keys are defined but not granted to default roles pending product approval.
10. Root `001_core.sql` remains a non-runtime proposal.

## 4. Open exit evidence

S5 remains unaccepted until all of the following are evidenced:

1. Repair Docker/WSL and run both migrations plus the repository suite against pinned PostgreSQL 18 using the real least-privilege runtime role.
2. Select the authoritative OpenAPI generation path, generate the S5 client from it, and add server/client drift checks. The current client is contract-validating and shared, but not yet mechanically generated from OpenAPI.
3. Add route-level HTTP integration tests against the compiled Nest application and real PostgreSQL.
4. Approve default role grants for `film.documents.read/edit` and `film.characters.read/edit`.
5. Approve the supported document-kind catalogue; persistence intentionally accepts namespaced keys rather than inventing a closed business list.
6. Approve snapshot/request size limits before public exposure; enforcement belongs with S7 rate/size controls.
7. Product owner accepts ADR-014, the canonical model, and this report.

## 5. Earlier blockers retained

- S0 business decisions, S1 device/PDF evidence and S2–S4 acceptance remain open.
- Real-provider identity, administrator MFA, transactional invitation email and remote CI/SBOM evidence remain pending.
- The credential/session exposure in `architecture.html` still requires owner-confirmed invalidation and quarantine/removal.

S6 can be implemented only as another explicitly recorded gate exception until S5 is accepted.
