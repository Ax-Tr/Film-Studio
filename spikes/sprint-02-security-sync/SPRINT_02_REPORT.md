# Sprint 02 — Security, Sync, Contracts and Operating Model

**Status:** Ready for product-owner review; not yet accepted  
**Date:** 13 November 2026  
**Gate note:** S1 physical-device/PDF work and S0 owner inputs remain open; S3 is blocked.

## 1. Delivered

| Area | Artifact/evidence | Status |
|---|---|---|
| Threat model | Assets, boundaries, actors, threat/control/test matrix, admin/session policy | Draft complete |
| Privacy/IP | Data inventory, flows, AI/admin constraints, retention and pre-production gates | Draft complete; owner/legal inputs open |
| Permissions | Data-driven film roles/permissions, resolution order, high-risk actions, Super Admin separation | Draft complete; role defaults need owner approval |
| Sync | Client state machine, push/pull/ack, structured conflicts, per-scene Yjs, compaction/revocation/retry rules | Draft complete plus executable reference tests |
| API | Contract authority, naming, idempotency, errors, files, realtime and compatibility | Draft complete |
| Error catalogue | Stable HTTP/code/retry/client-action mappings | Initial catalogue complete |
| Data ownership | Sources of truth, domain/table ownership, tenant/version/projection/migration rules | Draft complete |
| AI consent | Exact version/hash/provider/model/cost manifest and execution-time revalidation | Draft complete plus executable hash tests |
| Operations | Initial availability/performance/RPO/RTO hypotheses | CTO proposal; owner scale/budget inputs open |
| Hosting | AWS India direction, Mumbai primary/Hyderabad DR candidate, managed security baseline | Provisional; budget/account approval open |
| ADRs | ADR-004 hybrid sync, ADR-009 no billing, ADR-011 Super Admin boundary | Accepted baseline |

## 2. Executable result

Strict TypeScript typecheck passes. **14 tests across 3 files pass**:

- 5 permission/break-glass cases.
- 3 AI consent-integrity cases.
- 6 sync/conflict/cursor/compaction cases.

These are reference-model tests. S5/S6 must repeat the invariants using real PostgreSQL transactions, auth policies, local replicas, Yjs persistence and network fault injection.

## 3. CTO decisions

1. Current OWASP ASVS Level 2 is the minimum web/API verification baseline, with risk-selected higher controls for identity/admin/tenant/secret/export paths.
2. Current OWASP MASVS categories define the mobile security baseline.
3. OAuth/OIDC follows RFC 9700 practices: PKCE S256, exact redirects, CSRF/nonce/state, short access tokens and refresh rotation/replay response.
4. Super Admin is not a universal film role.
5. Per-scene Yjs plus structured versioned operations is accepted.
6. Billing is excluded; neutral quotas/feature policy remain.
7. AWS managed infrastructure in India is the provisional hosting direction, pending account/budget validation.
8. Zod/JSON contract schemas generate OpenAPI and client types; SQL migrations independently own persistence.

## 4. Items requiring owner approval

1. Default role matrix questions in `PRODUCT_INPUTS_REQUIRED.md`.
2. Identity/sign-in and recovery experience.
3. Retention/deletion/revoked-offline-copy policy.
4. Break-glass owner notification/legal exception.
5. Infrastructure budget, cloud account ownership, launch geography and DR cost.
6. Scale/support/SLO commitments and go/no-go authority.
7. AI provider/credential/cost/retention policy.

## 5. Exit assessment

S2 is technically ready for review but not accepted until the product owner approves or changes the items above. S3 must not begin because:

- The agreed workflow is sequential and S2 has not been accepted.
- S0 business inputs remain open.
- S1 mobile encryption/editor/device and canonical PDF gates remain open.

