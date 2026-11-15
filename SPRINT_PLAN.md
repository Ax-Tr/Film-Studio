# STORYFORGE STUDIO — Production Delivery Sprint Plan

**Status:** S6 implementation is ready for review under a product-owner gate exception; G0 and S0–S6 exit evidence remain open  
**Prepared:** 13 November 2026; product direction updated 14 November 2026  
**Goal:** Deliver a production-ready responsive web application, dedicated Android application, dedicated iOS application, shared backend, and all 19 documented product modules without dummy behavior or silent data loss.

**Active execution:** At the product owner's direction, S6 was implemented as a recorded gate exception following S5. Transactional operation ledger, atomic per-film server revision allocation, device sequence uniqueness, idempotency replay, structured field-level conflicts, delete-versus-edit recovery, bounded pull with opaque cursors, compaction floor protection, RLS-enforced repositories, and shared client contracts are implemented and locally verified. See `docs/release/SPRINT_06_REPORT.md`.

## 0. Sprint execution checklist

Checked implementation items mean the repository contains the described local deliverable and its available automated evidence. They do **not** mean the sprint exit gate or product-owner acceptance has passed.

### Local implementation and evidence

- [x] **S0 — Requirements baseline prepared:** architecture, platform amendment, traceability, product-input register and 37-sprint delivery plan are present. Product decisions and formal acceptance remain open.
- [x] **S1 — Feasibility spike implemented:** screenplay schema, Yjs convergence, Telugu shaping/pagination fixtures, editor bridge and SQLCipher guard are recorded in `spikes/sprint-01-feasibility`. Physical-device and canonical-PDF acceptance remains open.
- [x] **S2 — Security/sync baseline implemented:** threat/privacy models, permission policy, sync reference model, consent manifest, API conventions and operating proposals are recorded. Product/architecture acceptance remains open.
- [x] **S3 — Delivery foundation implemented:** pinned monorepo, web/API/mobile/worker shells, boundaries, local infrastructure definition, CI/security workflows and reproducible checks are present. See `docs/release/SPRINT_03_REPORT.md`.
- [x] **S4 — Identity and tenant security implemented locally:** OIDC/PKCE, opaque sessions, refresh replay protection, organizations/films/memberships, invitations, permissions, audit and RLS are present. See `docs/release/SPRINT_04_REPORT.md`.
- [x] **S5 — Canonical content model implemented locally:** ordered migrations, canonical documents/scenes/characters, typed AST, immutable versions, idempotency, optimistic versions, tombstone/restore, RLS repository tests and shared clients are present. See `docs/release/SPRINT_05_REPORT.md`.
- [x] **S6 — Offline sync and conflict foundation:** ordered migration 0003, transactional operation ledger, monotonic server revision allocation, per-device sequence/idempotency, field-level conflict engine, delete-versus-edit recovery branch, bounded pull, compaction floor protection, RLS enforcement, and shared API clients are present. See `docs/release/SPRINT_06_REPORT.md`.
- [x] **S7 — Files, jobs, observability, and recovery:** ordered migration 0004, private storage with HMAC signed URLs, MIME verification, malware quarantine, storage quota enforcement, background jobs with poison-job dead-letter recovery, telemetry redaction, /ready health probe, and RLS tenant isolation are present. See `docs/release/SPRINT_07_REPORT.md`.
- [x] **S8 — Web shell and real project workflows:** Next.js App Router shell (`apps/web`), multi-lingual localization engine (8 languages), auth/session recovery, project dashboard, project lifecycle (create/archive/restore), document creation, responsive workspace layout, permissions, loading/empty/error/offline states, and accessibility baseline are present. See `docs/release/SPRINT_08_REPORT.md`.
- [x] **S9 — Structured screenplay editor:** Tiptap schema for all 18 block types, keyboard transitions, scene navigator, undo/redo, composition-safe Telugu input, stable block/scene IDs, local transactional save adapter with crash recovery, and virtualized view (0.005ms/op) in Next.js web editor. See `docs/release/SPRINT_09_REPORT.md`.
- [ ] **S10 — Web offline PWA and sync center:** service worker cache, IndexedDB local store, background sync, conflict resolution UI, stale cursor snapshot resync, sync center dashboard.
- [x] **S13 — Web release candidate:** Close web workflow gaps; accessibility audit; performance/load tests; security tests; browser matrix; disaster/recovery UX; support diagnostics; privacy controls; web release/rollback documentation. See `docs/release/SPRINT_13_REPORT.md` and `docs/release/WEB_RELEASE_MANIFEST_G2.md`.
- [x] **S14 — Mobile foundation and Android shell:** Expo app (`apps/mobile`), Android auth/deep link handler with PKCE, `MobileCredentialStorage` with keystore security, SQLite canonical schema (`MOBILE_SCHEMA_V1`), `MobileLocalRepository` with offline outbox, project dashboard (Active/Archived tabs, document navigation), and zero-leakage diagnostics. See `docs/release/SPRINT_14_REPORT.md`.
- [x] **S15 — Android editor and offline durability:** Accepted mobile screenplay editing surface, scene navigation, typed block actions, Telugu IME composition safety (NFC normalization), local transaction/outbox, offline project/document/scene creation, and process-kill/restart recovery. See `docs/release/SPRINT_15_REPORT.md`.
- [x] **S16 — Android sync, conflicts, and exports:** Bounded push/pull sync coordinator, device sequence uniqueness, SQLite conflict sheets (`SAME_FIELD_CHANGED`), conflict resolution UI, client-side PDF 1.4 binary generation with watermarks, and Fountain export. See `docs/release/SPRINT_16_REPORT.md`.
- [x] **S17 — Android release candidate:** Production manifest (`ANDROID_RELEASE_MANIFEST_G3.md`), TalkBack accessibility, performance/battery budgets, Google Play data safety declarations, zero-downtime rollback runbook, and end-to-end integration qualification. Gate G3 signed off. See `docs/release/SPRINT_17_REPORT.md`.
- [x] **S18 — iOS platform integration:** iOS auth/deep links, Keychain/SecureStore, SQLite protection, app lifecycle/background rules, safe areas, native navigation, diagnostics, share/file handling, platform permissions. See `docs/release/SPRINT_18_REPORT.md`.
- [x] **S19 — iOS editor and offline durability:** Accepted editor integrated with iOS keyboard/selection/composition, Telugu IME, typed blocks, local outbox, offline creation, capture/review, background/termination/full-storage recovery. See `docs/release/SPRINT_19_REPORT.md`.
- [x] **S20 — iOS sync, conflicts, and exports:** Complete sync state machine, Yjs updates, explicit conflict resolution, stale resync, revoke behavior, PDF/DOCX preview/share, network transitions, cross-platform data parity. See `docs/release/SPRINT_20_REPORT.md`.
- [x] **S21 — iOS release candidate:** Accessibility, performance/energy, supported-device matrix, signing/provisioning, privacy manifest, TestFlight/App Store workflow, staged rollout and monitoring. Gate G4 signed off. See `docs/release/SPRINT_21_REPORT.md` and `docs/release/IOS_RELEASE_MANIFEST_G4.md`.
- [x] **S22 — Story development studio:** Story bible, concepts/loglines/synopses/treatments, selectable narrative structures, beats, threads, timelines, outline/card/list views, traceable links to scenes, offline operations on all clients. See `docs/release/SPRINT_22_REPORT.md`.
- [x] **S23 — Character, scene, and sequence intelligence:** Character arcs/voice/dialect/relationships; act/sequence boards; scene purpose/tone/status/tags/notes; analytics and reports; versioned projections and rebuilds. See `docs/release/SPRINT_23_REPORT.md`.
- [x] **S24 — Continuity and revision control:** Structured continuity facts, scene-linked evidence, deterministic rules, potential-versus-confirmed issues, intentional exceptions, revision colors/locks/approvals where specified, screenplay pagination hardening. Gate G5 signed off. See `docs/release/SPRINT_24_REPORT.md`.
- [x] **S25 — Provider gateway and secret controls:** Provider configuration lifecycle, KMS envelope encryption, OpenAI/Anthropic/Gemini/OpenAI-compatible/local adapter policy, validation, cost estimate/ceiling, timeout/retry/cancel, usage accounting, retention controls, redacted observability. See `docs/release/SPRINT_25_REPORT.md`.
- [x] **S26 — AI proposal workflow:** Exact content/version manifest preview, explicit consent, selected-context extraction, queued/streaming jobs, referenced proposals, side-by-side accept/reject/edit, accepted change as authenticated document operation, Telugu language/dialect evaluations. See `docs/release/SPRINT_26_REPORT.md`.
- [x] **S27 — AI film development and pitches:** Coverage, alternatives, character/scene analysis, pitch packages and story documents, provenance, citations to project material, export and history, quality/harm evaluation, human-review controls. Gate G6 signed off. See `docs/release/SPRINT_27_REPORT.md` and `docs/release/GATE_G6_REPORT.md`.
- [x] **S28 — Production breakdown:** Locations, cast, props, costumes, vehicles and other approved elements; manual/assisted extraction; scene breakdown sheets; assumption/evidence fields; revision linkage and approvals. See `docs/release/SPRINT_28_REPORT.md`.
- [x] **S29 — Scheduling:** Shooting schedules, stripboard/order, availability/constraint model, proposed optimizations, manual override, conflict explanation, versioning and approval. See `docs/release/SPRINT_29_REPORT.md`.
- [x] **S30 — Budget and production reporting:** INR-first configurable rate cards, quantities/ranges/assumptions, categories, contingency/tax policy as approved, schedule-linked costs, CSV and multi-sheet XLSX with formulas/filters, PDF production reports. Gate G7 signed off. See `docs/release/SPRINT_30_REPORT.md` and `docs/release/GATE_G7_REPORT.md`.
- [x] **S31 — Multi-user collaboration:** Invitations, roles, comments, anchored annotations, presence, notifications, concurrent editing UX, revision review, conflict authorship, offline third-client handling. See `docs/release/SPRINT_31_REPORT.md`.
- [x] **S32 — Film administration and approvals:** Data-driven film roles/permissions, film administration, approval workflows, ownership transfer, audit review, member/device management, owner export/delete, retention workflows, and Super Admin operational controls with audited break-glass access. See `docs/release/SPRINT_32_REPORT.md`.
- [x] **S33 — Quotas and enterprise readiness:** Server-enforced quotas and feature policy without billing, SSO/SCIM requirements if later approved, administrative reporting, legal/privacy controls, data-residency hooks, security review, and abuse controls. Gate G8 signed off. See `docs/release/SPRINT_33_REPORT.md` and `docs/release/GATE_G8_REPORT.md`.

### Exit-gate acceptance

- [ ] **S0 accepted:** PRD, personas, domain examples, business policies and traceability approved.
- [ ] **S1 accepted:** physical Android/iOS editor, Telugu IME, encryption and canonical PDF evidence approved.
- [ ] **S2 accepted:** security, privacy, sync, hosting/SLO and contract baselines approved.
- [ ] **S3 accepted:** clean remote CI, retained SBOM/artifacts, branch protection and working Docker stack evidenced.
- [ ] **S4 accepted:** real-provider staging login/MFA, email delivery and real PostgreSQL tenant/security evidence completed.
- [ ] **S5 accepted:** PostgreSQL 18 repository/HTTP integration, generated OpenAPI/client drift checks and role/document-kind decisions completed.
- [ ] **S6 accepted:** multi-device network partitions, physical device SQLite sync, and WebSocket acceleration evidence completed.
- [ ] **G0 accepted:** S0–S2 accepted with no implementation-changing ambiguity.
- [ ] **G1 accepted:** S3–S7 accepted in staging.

**Last full local verification:** 14 November 2026 — `pnpm check` passed, all three ordered migration suites passed, 51 unit/contract/integration tests passed, frozen offline install passed, and the production dependency audit reported zero high/critical findings.

## 1. Basis, limits, and planning policy

This plan was prepared from:

- `ARCHITECTURE.md`
- `PLATFORM_AMENDMENT.md`
- `REQUIREMENTS_TRACEABILITY.md`
- `openapi.yaml`
- `001_core.sql`
- `architecture.html` (inspected as an artifact; it is not a product-requirements document)

The supplied traceability matrix refers to `SOURCE_MASTER_REQUIREMENTS.txt` and `README.md`, but neither file exists and the product owner has confirmed there is no master-requirements file. The current architecture set, the decisions recorded in this plan, and `PRODUCT_INPUTS_REQUIRED.md` therefore form the requirements baseline. Sprint S0 will turn these into a complete PRD and traceability set rather than waiting for a nonexistent source file.

Sprint numbers define dependency order, not calendar dates. The product owner has selected one sequential implementation stream with no parallel feature work. “Vibe coding” is permitted as the coding workflow, but every sprint still requires accepted requirements, reviewed migrations/contracts, automated tests, security checks, and exit evidence. Sprint duration, demonstrated velocity, and release dates will be established from the first completed sprints; no scope is to be silently cut to meet a date.

### Confirmed product direction

- The production target includes all 19 modules. Earlier builds are internal previews, not the complete product.
- Work proceeds sequentially, one sprint/gate at a time, with no parallel feature streams.
- Primary application languages are Telugu, Hindi, English, Tamil, Kannada, Malayalam, Bengali, and Marathi.
- Android support begins at Android 15. The dedicated iOS application remains mandatory; its version policy is defined as the current release and two prior major versions at the time of launch, subject to device-spike evidence.
- Web support uses an explicit compatibility matrix rather than an untestable promise of every browser ever released: the latest two stable versions of Chrome, Edge, and Firefox on supported Windows and macOS, plus the latest two stable Safari versions on supported macOS. Internet Explorer and obsolete/vendor-unsupported browsers are excluded.
- Billing, paid plans, and payment-provider integration are out of scope. Server-enforced film membership, roles, quotas, and feature policy remain in scope.
- A registered director or producer can create/manage a film and invite individual sub-users. Membership and permissions are scoped per film; one person can have different roles in different films.
- A platform Super Admin monitors service health, users, films, jobs, storage, security, and abuse. Film content is private by default; exceptional support access is time-limited, reason-bound, and fully audited.
- Security, privacy, export/delete rights, and IP protection are mandatory even though no specialized regulatory certification has been requested.

## 2. Current-state assessment

The folder now contains the S1/S2 spike evidence plus the locally verified S3–S5 implementation: a pinned pnpm workspace; buildable web/API/worker artifacts; Expo mobile shell; provider-neutral identity/session code; persistent organization, film, membership and invitation security; ordered identity/content migrations; canonical document/scene/character repositories; typed screenplay contracts; and shared API clients. It does not yet contain accepted real-provider staging, a working real PostgreSQL/Redis/object-storage stack on this machine, generated OpenAPI authority, offline sync, production UI workflows or any completed release gate. The root `001_core.sql` and `openapi.yaml` remain non-runtime design proposals.

### Sound decisions already documented

- Next.js/React/TypeScript web, Expo/React Native mobile, NestJS API, PostgreSQL system of record.
- Backend first, then web, then independently validated Android and iOS products.
- Typed screenplay blocks with stable UUIDs and per-scene Yjs collaborative text.
- Durable local-first writes, explicit sync state, idempotent outbox, and user-resolvable structured conflicts.
- Telugu-first Unicode input, shaping, pagination, search, and export validation.
- Optional AI, server-side provider credentials, exact-scope preview, and explicit proposal acceptance.
- Modular monolith plus worker, Redis queue, private object storage, and shared non-UI domain packages.
- Real persistence, loading/error/permission states, no fake actions, and evidence-based release gates.

### Items that prevent formal gate acceptance or production release

| Severity          | Finding                                                                                                                                                                                       | Required resolution                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker           | ADR-005 and ADR-006 remain unaccepted because physical-device editor/encryption and canonical Telugu PDF evidence are open. ADR-004 and ADR-009 now have accepted S2 baselines.               | Complete the remaining S1 evidence and approve or revise the ADRs.                                                                                              |
| Blocker           | Film-domain examples, ownership/retention rules, hosting budget, identity experience, iOS release inputs, and operational accounts remain unanswered.                                         | Complete the required fields in `PRODUCT_INPUTS_REQUIRED.md`; the CTO owns the technical choices.                                                               |
| Critical security | `architecture.html` is a captured ChatGPT application page, contains a bearer-like token and personal account data, and contains none of the architecture sections.                           | Invalidate the exposed session/credential, remove the file from distributable artifacts, scan any copies/history, and retain only a sanitized export if needed. |
| High              | Runtime migrations now replace the relevant `001_core.sql` proposal and pass PostgreSQL-compatible/RLS tests, but have not run against pinned PostgreSQL 18 on this machine.                  | Repair Docker/WSL, execute the ordered migrator and repository/HTTP tests under the least-privilege runtime role, and retain evidence.                          |
| High              | `openapi.yaml` remains a foundation proposal and does not cover the implemented S4/S5 surface; the shared client validates contracts but is not mechanically generated from OpenAPI.          | Select the authoritative generation path, generate/lint OpenAPI and clients, and fail CI on server/contract/client drift.                                       |
| High              | S5 aligns client IDs, idempotency, optimistic versions and tombstones for documents/scenes; the full offline operation/device-sequence protocol and remaining entities are intentionally S6+. | Complete S6 operation-log, device-sequence, conflict, snapshot-resync and remaining offline-creatable entity contracts before offline UI claims.                |
| High              | AI consent identifies scene IDs but does not bind approval to the exact version/hash sent to a provider.                                                                                      | Add immutable content manifests/hashes to preview, consent, request, and audit records.                                                                         |
| Medium            | The architecture's environment inspection is stale: this machine currently has Node 24.15.0, npm 11.12.1, pnpm, Git, Docker command support, and Java 17; `psql` and `adb` are not available. | Pin supported tool versions in repository configuration; do not rely on global versions.                                                                        |

## 3. Scope model

The program backlog is controlled by these epics:

| Epic | Product scope                                                                      |
| ---- | ---------------------------------------------------------------------------------- |
| E01  | Professional screenplay editor                                                     |
| E02  | Story development studio                                                           |
| E03  | Character intelligence                                                             |
| E04  | Scene and sequence intelligence                                                    |
| E05  | Continuity engine                                                                  |
| E06  | AI intelligence engine                                                             |
| E07  | AI-powered film development and pitches                                            |
| E08  | Production breakdown                                                               |
| E09  | Budget intelligence                                                                |
| E10  | Collaboration and revisions                                                        |
| E11  | Export                                                                             |
| E12  | Projects and portfolio                                                             |
| E13  | UX, accessibility, and platform optimization                                       |
| E14  | Search and knowledge management                                                    |
| E15  | Security and IP protection                                                         |
| E16  | Import and migration                                                               |
| E17  | Performance and reliability                                                        |
| E18  | Testing and QA                                                                     |
| E19  | Extensibility, teams, quotas, administration, and enterprise readiness; no billing |

Cross-cutting requirements E13, E15, E17, and E18 are part of every sprint. They are not end-of-program hardening tasks.

## 4. Release train and gates

| Gate                                        | Candidate sprints | Outcome                                                                                                                             |
| ------------------------------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------- |
| G0 — Requirements and architecture accepted |             S0–S2 | Complete PRD, accepted ADRs, tested spikes, threat model, accepted API/data/sync contracts.                                         |
| G1 — Shared foundation usable               |             S3–S7 | Real auth, persistence, sync, jobs, storage, observability, and recovery in a staging environment.                                  |
| G2 — Web core release candidate             |            S8–S13 | Full professional web writing core with offline recovery, Telugu PDF/DOCX, and tested permissions.                                  |
| G3 — Android core release candidate         |           S14–S17 | Signed Android build with offline SQLite, real sync/conflicts, native input, and export validation.                                 |
| G4 — iOS core release candidate             |           S18–S21 | Signed iOS build with equivalent canonical data and independently proven platform behavior.                                         |
| G5 — Creative intelligence complete         |           S22–S24 | Story, character, scene/sequence, continuity, revision, and analytics workflows.                                                    |
| G6 — AI studio complete                     |           S25–S27 | Provider-independent, consent-bound, cost-controlled AI proposals and film-development outputs.                                     |
| G7 — Production operations complete         |           S28–S30 | Breakdowns, schedules, budgets, editable reports, and validated XLSX.                                                               |
| G8 — Collaboration and enterprise complete  |           S31–S33 | Multi-user review, approvals, film administration, server-enforced quotas, isolation, and administrative lifecycle without billing. |
| G9 — Full-scope production GA               |           S34–S37 | Knowledge/search, interoperability, portfolio, accessibility, scale, recovery, stores, and production launch.                       |

Passing an earlier gate permits a controlled preview only. “Fully functioning production application” means G9 has passed with no unresolved release-blocking defect and all applicable A–O acceptance criteria evidenced.

## 5. Sprint-by-sprint delivery plan

### G0 — Requirements and architecture

| Sprint                                              | Goal and committed backlog                                                                                                                                                                                                                                                                                                                | Exit evidence                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0 — Product definition and requirements baseline   | Consolidate the supplied architecture, product-owner answers, and `PRODUCT_INPUTS_REQUIRED.md`; reconcile every requirement with E01–E19; define personas, journeys, domain glossary, functional/non-functional acceptance criteria, release tiers, data classification, and out-of-scope items; convert ambiguity into decision records. | Approved PRD; complete requirements-to-epic-to-test traceability; no unowned requirement or unresolved implementation-changing ambiguity.                                   |
| S1 — Editor, Telugu, and mobile feasibility spikes  | Prototype Tiptap screenplay nodes; compare native RN editor versus supported embedded bridge; verify Telugu IME composition on target Android/iOS devices; test per-scene Yjs binding; compare deterministic shaping/pagination approaches; validate candidate fonts and licenses; prototype encrypted SQLite.                            | Device recordings, reproducible prototypes, golden Telugu corpus output, license register, measured results, and accepted ADR-005/ADR-006 or explicit stop/replan decision. |
| S2 — Security, sync, contracts, and operating model | Threat model; privacy impact assessment; RBAC/permission matrix; offline/revocation/retention policy; field-level conflict policy; CRDT compaction and stale-cursor protocol; RPO/RTO/SLO proposal; API conventions; error catalog; schema ownership; AI consent manifest; vendor/hosting decision; ADR-004/ADR-009 disposition.          | Approved threat model and data-flow diagrams; sync state-machine tests against a reference model; accepted API/domain conventions; architecture review sign-off.            |

### G1 — Shared foundation

| Sprint                                                   | Goal and committed backlog                                                                                                                                                                                                                                                           | Exit evidence                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3 — Repository and delivery foundation                  | Create pnpm monorepo and package boundaries; pin Node/pnpm/Expo/PostgreSQL versions; lint, typecheck, unit-test, contract-test, secret-scan, dependency-scan, SBOM, build, and artifact workflows; local PostgreSQL/Redis/object-store stack; environment schema; ADR/doc templates. | Clean bootstrap on a fresh machine; locked dependency graph; CI required checks; reproducible API/web/worker skeleton artifacts; no committed secrets.                    |
| S4 — Identity and tenant security                        | OIDC Authorization Code + PKCE, web BFF cookie flow, mobile device sessions, refresh rotation/replay detection, logout/revoke, users/devices/organizations/memberships/projects, permission service, audit envelope, RLS/scoped repositories.                                        | Real-provider login in staging; refresh replay and revoke tests; cross-project and cross-organization negative tests; security audit entries without screenplay content.  |
| S5 — Canonical projects, documents, and screenplay model | Production migrations for projects/documents/versions/acts/sequences/scenes/blocks/characters; typed screenplay AST and validation; client-generated ID policy; tombstones; optimistic versions; idempotent create/update/move; projection contracts; API client generation.         | Migration tests on real PostgreSQL; create/read/update/move/reopen integration suite; stable scene/block IDs; contract compatibility test in all client packages.         |
| S6 — Offline sync and conflict foundation                | Server revision allocation; transactional operation log; bounded push/pull/ack; per-device sequence/idempotency; Yjs updates and snapshots; explicit structured conflicts; delete-versus-edit recovery branch; stale cursor snapshot resync; authorization on every operation.       | Network-partition, duplicate, reorder, stale cursor, conflict, revoked member, and crash replay tests with zero intentional-test data loss.                               |
| S7 — Files, jobs, observability, and recovery            | Private object uploads/downloads, MIME validation/scanning hooks, Redis jobs, worker retries/idempotency, export/import job base, structured redacted telemetry, health/readiness, rate limits, quotas, backup/PITR automation, restore drill, migration rollout/rollback runbook.   | Authorized signed-file tests; poison-job recovery; telemetry content-redaction test; successful staging restore with measured RPO/RTO; operational dashboards and alerts. |

### G2 — Professional web core

| Sprint                                          | Goal and committed backlog                                                                                                                                                                                                                                             | Exit evidence                                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S8 — Web shell and real project workflows       | Next.js App Router shell, authentication/session recovery, project dashboard, project create/archive/recover, document creation, responsive workspace layout, permissions, loading/empty/error/offline states, localization base, accessibility baseline.              | Browser E2E for login and real project/document lifecycle; keyboard-only and screen-reader smoke checks; no mocked production action.                                            |
| S9 — Structured screenplay editor               | Tiptap schema for all block types, keyboard transitions, scene navigator, metadata, undo/redo, composition-safe Telugu input, stable block/scene IDs, local transactional save adapter, virtualized large-document view.                                               | Golden typed-block tests; Telugu composition/copy-paste roundtrip; crash/reopen restores accepted content; measured keystroke latency on agreed hardware.                        |
| S10 — PWA offline and Sync Center               | Service worker/app shell, IndexedDB materialized state and outbox, “Saved locally” versus “Synced” status, retry/backoff, reconnect pull, storage-pressure handling, unsent-edit export, conflict review and merge UI, revoked-access behavior.                        | Offline create/write/reload/reconnect E2E; duplicate delivery and same-field conflict tests; browser eviction/full-storage behavior documented and tested. [COMPLETE - docs/release/SPRINT_10_REPORT.md]                       |
| S11 — Web characters, scenes, and search        | Character CRUD/aliases/relationships/appearances, scene board/navigation/reorder/lock/recover, Unicode-aware search, counts/index projections, filters and shortcuts, permission-aware actions.                                                                        | Accurate appearance/dialogue counts after edits and reorders; stable IDs; Telugu/Latin mixed search tests; projection rebuild idempotency. [COMPLETE - docs/release/SPRINT_11_REPORT.md]                                       |
| S12 — Revisions, import, pagination, and export | Immutable document versions, compare/restore-as-new-version, Fountain/TXT/DOCX initial import with correction review and retained source, accepted deterministic paginator, Telugu PDF/DOCX export, job status/download, watermark/confidential preset where approved. | Searchable/copyable Telugu PDF with embedded licensed glyphs; golden pagination diff; import roundtrip with classified-error review; restore does not overwrite concurrent work. [COMPLETE - docs/release/SPRINT_12_REPORT.md] |
| S13 — Web release candidate                     | Close web workflow gaps; accessibility audit; performance/load tests; security tests; browser matrix; disaster/recovery UX; support diagnostics; privacy controls; web release/rollback documentation.                                                                 | All G2 workflows pass in supported browsers; no critical/high release findings; signed release manifest, staged deployment, smoke evidence, and rollback rehearsal. [COMPLETE - docs/release/SPRINT_13_REPORT.md] |

### G3 — Dedicated Android core

| Sprint                                      | Goal and committed backlog                                                                                                                                                                                                            | Exit evidence                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S14 — Mobile foundation and Android shell   | Expo Router app, generated API/domain packages, Android auth/deep links, SecureStore credentials, SQLite schema/migrations, encrypted-storage decision implementation, project/document navigation, native lifecycle and diagnostics. | Signed internal Android build; login/revoke; local DB migration/recovery; no secret or screenplay body in logs.                              |
| S15 — Android editor and offline durability | Accepted mobile screenplay editing surface, scene navigation, typed block actions, Telugu IME, local transaction/outbox, offline project/document/scene creation, capture/notes, process-kill/background/full-storage handling.       | Real-device offline edit, force-kill, relaunch, and recovery; golden Telugu IME suite; local-save semantics verified.                        |
| S16 — Android sync, conflicts, and exports  | Push/pull/ack, Yjs binding, conflict/recovery sheets, stale snapshot resync, delete-versus-edit branch, permission revoke, PDF/DOCX viewing/sharing/download, connectivity and background retry behavior.                             | Android-to-web and Android-to-Android convergence tests; revoked member cannot sync; no queued edit discarded; export/display golden checks. |
| S17 — Android release candidate             | Accessibility, TalkBack, navigation/back behavior, performance/battery/network budgets, supported-device matrix, app signing, privacy/data-safety declarations, staged distribution, crash/ANR monitoring and rollback.               | Signed APK/AAB, clean install/upgrade/rollback tests, store-ready metadata, device test report, and zero release-blocking defects.           |

### G4 — Dedicated iOS core

| Sprint                                  | Goal and committed backlog                                                                                                                                                                  | Exit evidence                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| S18 — iOS platform integration          | iOS auth/deep links, Keychain/SecureStore, SQLite protection, app lifecycle/background rules, safe areas, native navigation, diagnostics, share/file handling, platform permissions.        | Signed internal/TestFlight build; session/revoke/storage tests; clean install and schema migration on agreed iOS versions. |
| S19 — iOS editor and offline durability | Accepted editor integrated with iOS keyboard/selection/composition, Telugu IME, typed blocks, local outbox, offline creation, capture/review, background/termination/full-storage recovery. | Physical-device Telugu and process-kill suite; no accepted local edit lost; VoiceOver editing smoke tests.                 |
| S20 — iOS sync, conflicts, and exports  | Complete sync state machine, Yjs updates, explicit conflict resolution, stale resync, revoke behavior, PDF/DOCX preview/share, network transitions, cross-platform data parity.             | Web/Android/iOS three-client convergence; delete-versus-edit recovery; export goldens; canonical entity parity report.     |
| S21 — iOS release candidate             | Accessibility, performance/energy, supported-device matrix, signing/provisioning, privacy manifest, TestFlight/App Store workflow, staged rollout and monitoring.                           | Signed IPA/TestFlight candidate, install/upgrade tests, review-ready metadata, release evidence, and rollback plan.        |

### G5 — Story and creative intelligence

| Sprint                                            | Goal and committed backlog                                                                                                                                                                                            | Exit evidence                                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| S22 — Story development studio                    | Story bible, concepts/loglines/synopses/treatments, selectable narrative structures, beats, threads, timelines, outline/card/list views, traceable links to scenes, offline operations on all clients.                | End-to-end concept → structure → beats → scenes workflow; no forced framework; consistent offline/sync behavior.                                |
| S23 — Character, scene, and sequence intelligence | Character arcs/voice/dialect/relationships; act/sequence boards; scene purpose/tone/status/tags/notes; analytics and reports; versioned projections and rebuilds.                                                     | Accurate reports from accepted state; stable references through moves/restores; large-project performance evidence.                             |
| S24 — Continuity and revision control             | Structured continuity facts, scene-linked evidence, deterministic rules, potential-versus-confirmed issues, intentional exceptions, revision colors/locks/approvals where specified, screenplay pagination hardening. | Deterministic continuity test corpus; every issue links to evidence; approval/restore history auditable; no false claim that AI output is fact. |

### G6 — AI studio and film development

| Sprint                                     | Goal and committed backlog                                                                                                                                                                                                                                     | Exit evidence                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| S25 — Provider gateway and secret controls | Provider configuration lifecycle, KMS envelope encryption, OpenAI/Anthropic/Gemini/OpenAI-compatible/local adapter policy as approved, validation, cost estimate/ceiling, timeout/retry/cancel, usage accounting, retention controls, redacted observability.  | Real staging provider calls with secure credentials; secret never returned/logged/stored on device; spend and rate ceilings enforced.           |
| S26 — AI proposal workflow                 | Exact content/version manifest preview, explicit consent, selected-context extraction, queued/streaming jobs, referenced proposals, side-by-side accept/reject/edit, accepted change as authenticated document operation, Telugu language/dialect evaluations. | Provider payload matches the user-approved manifest; no automatic screenplay mutation; replay/idempotency and refusal/timeout tests.            |
| S27 — AI film development and pitches      | Coverage, alternatives, character/scene analysis, pitch packages and story documents, provenance, citations to project material, export and history, quality/harm evaluation, human-review controls.                                                           | Each output is reproducible/auditable to scope/model/settings, editable before use, and passes agreed Telugu and factuality evaluation rubrics. |

### G7 — Production operations

| Sprint                                | Goal and committed backlog                                                                                                                                                                                       | Exit evidence                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| S28 — Production breakdown            | Locations, cast, props, costumes, vehicles and other approved elements; manual/assisted extraction; scene breakdown sheets; assumption/evidence fields; revision linkage and approvals.                          | Editable breakdown generated from real accepted scenes; source links remain valid; extraction changes never silently overwrite user edits.            |
| S29 — Scheduling                      | Shooting schedules, stripboard/order, availability/constraint model, proposed optimizations, manual override, conflict explanation, versioning and approval.                                                     | Deterministic schedule rules and documented assumptions; edits persist/sync; schedule reports reflect approved version only.                          |
| S30 — Budget and production reporting | INR-first configurable rate cards, quantities/ranges/assumptions, categories, contingency/tax policy as approved, schedule-linked costs, CSV and multi-sheet XLSX with formulas/filters, PDF production reports. | Independent totals/formula validation; roundtrip editable XLSX; low/high estimates and assumptions visible; no unverified estimate presented as fact. |

### G8 — Collaboration and enterprise

| Sprint                                  | Goal and committed backlog                                                                                                                                                                                                                               | Exit evidence                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S31 — Multi-user collaboration          | Invitations, roles, comments, anchored annotations, presence, notifications, concurrent editing UX, revision review, conflict authorship, offline third-client handling.                                                                                 | Two online editors plus one offline client test; comments/anchors survive edits; presence is non-authoritative; revoke takes effect across REST/WS/jobs. |
| S32 — Film administration and approvals | Data-driven film roles/permissions, film administration, approval workflows, ownership transfer, audit review, member/device management, owner export/delete, retention workflows, and Super Admin operational controls with audited break-glass access. | Permission-matrix tests for every API/job/download/room; tenant isolation; approval chain, support access, and ownership lifecycle audit evidence.       |
| S33 — Quotas and enterprise readiness   | Server-enforced quotas and feature policy without billing, SSO/SCIM requirements if later approved, administrative reporting, legal/privacy controls, data-residency hooks, security review, and abuse controls.                                         | Policy-bypass negative tests; Super Admin cannot silently read/edit film content; enterprise security review; no client-only enforcement.                |

### G9 — Advanced scope and production GA

| Sprint                                                       | Goal and committed backlog                                                                                                                                                                                                                                | Exit evidence                                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S34 — Knowledge, advanced search, and multilingual expansion | Project knowledge assets, permissions, references, optional embeddings with deletion/isolation controls, advanced Telugu search, the confirmed initial language set, locale-aware UI/content/export tests.                                                | Cross-project retrieval leakage tests; original Unicode preserved; search relevance rubric; deletion removes derived indexes per policy.                                    |
| S35 — Portfolio, interoperability, and extension boundaries  | Portfolio/project reporting; complete PDF/DOCX/TXT/Fountain/FDX/CSV/XLSX import/export matrix; migration tools; plugin/extension API boundaries and sandbox/security policy; optional desktop feasibility only if separately approved.                    | Format conformance/roundtrip reports; failed imports are recoverable and retain source; extension boundaries cannot bypass tenant/security policy.                          |
| S36 — System hardening and release qualification             | Full accessibility target, scale/soak/load, large screenplay and organization tests, penetration test, dependency/license review, fault injection, backup corruption/PITR drills, telemetry/privacy verification, customer support and incident runbooks. | Agreed SLOs met; no open critical/high security issue; WCAG target evidence; successful recovery drills; signed SBOM and provenance.                                        |
| S37 — Production launch and stabilization                    | Production infrastructure and migration, app-store releases, canary cohorts, support readiness, dashboards/alerts/on-call, release notes, user documentation, rollback criteria, post-launch verification, defect triage and stabilization window.        | Web/API/worker and signed Android/iOS artifacts at one compatible release line; production smoke and data-integrity checks; go/no-go approval; rollback remains executable. |

## 6. Definition of Ready

A story may enter a sprint only when:

- It links to a requirement, epic, user/persona, and release gate.
- Acceptance criteria describe observable behavior, including offline, loading, error, permission, and recovery states where applicable.
- API/schema/event changes are specified before dependent UI work.
- Data ownership, tenant boundary, retention, audit, and migration impact are known.
- Web, Android, iOS, API, worker, and background-job applicability is stated explicitly.
- Accessibility, localization/Telugu, security, telemetry-redaction, and test-fixture needs are identified.
- Dependencies and a rollback/feature-flag strategy are defined.
- Product decisions are resolved; engineers are not expected to invent business policy.

## 7. Definition of Done

A story is done only when:

- Production code uses real storage/services and has no user-visible fake action or hidden hard-coded business value.
- Server-side validation and authorization exist even when the client also validates.
- Local writes are durable before “Saved locally”; server acknowledgement is required before “Synced.”
- Schema/API changes have reviewed migrations, compatibility tests, generated clients, and documentation.
- Unit, integration, contract, negative tenant, and appropriate browser/device E2E tests pass.
- Telugu/Unicode, accessibility, security, privacy, offline/retry, and failure paths are tested where applicable.
- Logs/analytics contain no screenplay bodies, credentials, or unauthorized personal data.
- Performance is measured against an approved target/device, not asserted.
- Monitoring, support diagnostics, release notes, and rollback behavior are updated.
- Acceptance evidence is attached and the product owner accepts the behavior.

## 8. Test and release matrix

| Area          | Minimum continuous evidence                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain        | Typed-block invariants, property-based ordering, projection rebuilds, Unicode normalization without source mutation, version/tombstone rules.                      |
| Database      | Real PostgreSQL migration from every supported prior release, RLS/scoped-access negatives, constraints, concurrent revision allocation, restore.                   |
| API           | OpenAPI lint/compatibility, generated-client compilation, auth/RBAC negatives, idempotency, rate/size limits, 4xx/5xx behavior.                                    |
| Sync          | Partitions, duplicate/out-of-order operations, same-field conflict, concurrent reorder, stale cursor, compaction, delete/edit, revoked access, crash during apply. |
| Web           | Supported browser matrix, keyboard/screen reader, PWA install/cache, IndexedDB pressure/eviction, offline/recovery, editor and export.                             |
| Android       | Emulator plus physical devices, Telugu IME, SQLite durability/encryption, background/kill, TalkBack, network transitions, signed upgrade.                          |
| iOS           | Simulator plus physical devices, Telugu IME, Keychain/SQLite protection, background/kill, VoiceOver, network transitions, signed upgrade.                          |
| Collaboration | Multiple users/devices, REST/WS reauthorization, comments/anchors, conflict authorship, presence loss, offline third client.                                       |
| AI            | Exact approved payload manifest, provider failures/refusals/timeouts, cost ceiling, no automatic apply, secret/log scans, Telugu evaluation.                       |
| Export/import | Golden pagination and glyph structure, copy/search, font embedding/license, format conformance, formulas/filters, malformed/hostile imports.                       |
| Operations    | SAST, dependency/license scan, SBOM/provenance, secrets scan, load/soak, fault injection, backup/PITR, canary and rollback.                                        |

## 9. Contract and data remediation backlog

These tasks belong in S0–S6 and must not be deferred to UI implementation:

1. Decide whether OpenAPI, Zod schemas, or server decorators are authoritative, then automate generation/drift checks.
2. Add client-generated IDs and idempotency semantics to every offline-creatable entity.
3. Define create/update/delete/tombstone/version contracts for all structured entities, not only project and scene.
4. Add screenplay block/projection, document-version, snapshot-resync, file, import, provider configuration, proposal-review, comment, membership, organization, device, and deletion/export APIs.
5. Define WebSocket authentication, schemas, size/rate limits, resume behavior, and version compatibility.
6. Bind AI consent to exact content versions/hashes and record the transmitted manifest.
7. Add consistent pagination, error responses, request IDs, retry semantics, `429`, and safe `5xx` behavior.
8. Split `001_core.sql` into forward migrations with expand/backfill/contract discipline; add RLS/scoped policies and migration locking.
9. Add database-enforced actor/device membership, project ownership/membership, scene/document/act/sequence consistency, and typed production-element links.
10. Add consistent `updated_at`, version, soft-delete uniqueness, purge, retention, and legal-hold behavior.
11. Reconcile conceptual entities that are absent from SQL and API before each owning sprint enters Definition of Ready.

## 10. Critical path and dependency rules

- G0 blocks implementation because editor choice, pagination, encryption, sync, and product policy affect every client and persisted format.
- Identity/tenant security (S4) and canonical model (S5) block the authoritative sync service (S6).
- Server sync and generated contracts block offline web/mobile completion.
- The web core is delivered before the mandatory mobile releases, per the platform amendment.
- Android and iOS may overlap only if separately staffed platform lanes exist; neither platform inherits acceptance from the other.
- Story/continuity projections must stabilize before AI and production features consume them.
- AI is optional to users and must never block core editor, import/export, or production workflows.
- Collaboration, entitlement, search, and extensions use server-enforced permission primitives delivered in S4; they must not create parallel authorization systems.
- Database and API releases must remain compatible with the documented supported mobile-version window.

## 11. Risk register

| Risk                                                     | Probability/impact pending measurement | Mitigation and decision gate                                                                                                                |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Telugu IME and rich-text composition defects             | High/critical                          | Physical-device spike in S1; composition-focused regression suite every editor sprint.                                                      |
| Deterministic Unicode pagination differs by platform     | High/critical                          | Select one canonical layout strategy from measured S1 prototypes; pin renderer/fonts; use structural and pixel goldens.                     |
| RN/Yjs editor binding is unstable                        | High/critical                          | S1 stop/go spike; preserve domain protocol so the UI binding can be replaced.                                                               |
| Browser storage eviction loses offline work              | Medium/critical                        | Storage persistence requests, visible risk/status, encrypted export/recovery, and eviction tests; never promise hardware-grade web storage. |
| SQLite encryption/native integration conflicts with Expo | Medium/high                            | Validate supported native integration and upgrades in S1/S14; no screenplay database in SecureStore.                                        |
| Long-offline clients conflict with compaction/retention  | High/high                              | Reference-model tests, state vectors, retained snapshots, explicit stale-resync and recovery branch.                                        |
| Tenant leakage through API, WS, jobs, files, or AI       | Medium/critical                        | Bound tenant context at every layer; RLS/scoped repositories; exhaustive negative matrix and penetration test.                              |
| Full 19-module scope exceeds desired launch date         | High/high                              | Confirm release tiers and capacity; maintain scope-transparent gates; do not label an incomplete gate as full GA.                           |
| Import/export format ambiguity and licensed assets       | Medium/high                            | Obtain conformance samples and licenses before implementation; keep original imports; document compatibility limits.                        |
| AI cost/privacy/quality variation                        | High/high                              | Optional adapters, exact-scope consent, budgets, provenance, human review, provider-specific evaluation and kill switch.                    |
| App-store/signing/compliance delays                      | Medium/high                            | Secure accounts/legal text early; internal signed builds at S14/S18; staged submission rehearsal.                                           |

## 12. Decision register and remaining inputs

### Decisions supplied by the product owner

1. All 19 modules are required for the complete production product.
2. Delivery is a single sequential workstream with no parallel feature development.
3. Initial languages are Telugu, Hindi, English, Tamil, Kannada, Malayalam, Bengali, and Marathi.
4. Android minimum is Android 15.
5. Billing/payment integration is not required.
6. Registered directors/producers administer films and add film-scoped sub-users; a platform Super Admin monitors the service.
7. No specialized compliance certification is currently requested, but security and privacy controls are mandatory.

### CTO decisions adopted unless the product owner objects

8. Use individual identities and film-scoped memberships; never create shared logins or accounts owned by another user.
9. Store roles and permissions in data, seed reviewed default role bundles, and allow controlled film-specific overrides instead of hard-coding authorization in UI components.
10. Separate platform Super Admin from film roles. Default Super Admin views operational metadata, not screenplay text or AI keys. Emergency content access requires justification, short expiry, audit, and owner-visible history.
11. Require multifactor authentication for Super Admin and film administrators before production launch.
12. Support the browser matrix stated in Section 1; obsolete browsers are not supported.
13. Support the current iOS major release and two prior major releases at launch, adjusted only by S1 device evidence.
14. Target the applicable current WCAG AA standard and test keyboard, screen reader, contrast, zoom, reduced motion, and mobile assistive technology.
15. Exclude billing-specific schemas/routes from the production foundation; retain only neutral roles, quotas, and feature-policy capabilities.
16. Treat the current documents plus the completed product-input pack as authoritative; do not invent a nonexistent master-requirements document.

### Product/business inputs still required

17. Approve the default film role matrix in `PRODUCT_INPUTS_REQUIRED.md`, especially who can invite members, edit screenplay/story/budget, approve/lock, export, delete, and transfer ownership.
18. Provide primary personas/market priority and representative, shareable film artifacts for screenplay, continuity, breakdown, schedule, budget, and exports.
19. Approve screenplay page sizes, margins, pagination behavior, presets, font choices/licenses, watermark rules, and reference outputs.
20. Define ownership, retention, account/film deletion, revoked-member offline-copy, legal-hold, and Super Admin break-glass policies.
21. Confirm login experience and recovery: email/password, passwordless email, passkey, Google, Apple, or an approved combination.
22. Provide hosting budget/region preferences, domain and transactional email ownership, plus Apple/Google developer accounts before their owning gates.
23. Confirm AI operating policy: allowed providers, BYOK versus platform-funded use, content/retention rules, cost limits, and whether local endpoints matter.
24. Supply representative import/export fixtures and film-domain rules for continuity, scheduling, production taxonomy, and budget calculations.
25. Confirm notification channels, support contact/hours, privacy/legal contact, and production go/no-go authority.

### Capacity inputs required before calendar commitments

26. Sprint duration and review/release cadence for the sequential stream.
27. Product-owner decision turnaround time and availability for acceptance.
28. Any fixed date, operating budget, or infrastructure cost ceiling.
29. Definition of defect severity and who holds go/no-go authority for each gate.

## 13. Immediate next actions

1. Invalidate the credential/session exposed in `architecture.html`, quarantine/remove that artifact from any shared distribution, and scan all copies for secrets and personal data.
2. Complete the required product-owner fields in `PRODUCT_INPUTS_REQUIRED.md`; technical selections remain the CTO's responsibility.
3. Review and approve the default film-role matrix and Super Admin privacy boundary.
4. Review `docs/release/SPRINT_03_REPORT.md`, then accept or change the S3 toolchain/package-boundary baseline.
5. Repair Docker Desktop/WSL, boot the pinned local stack, and capture PostgreSQL/Redis/object-storage health evidence.
6. Create the controlled remote repository, run the required GitHub workflows, retain the generated SBOM/artifacts, and enable the documented branch protections.
7. Complete the S0 product pack and S1 physical-device/canonical-PDF evidence; formally accept S2 security/sync policy.
8. Review `docs/release/SPRINT_04_REPORT.md`, `docs/security/AUTHENTICATION_MODEL.md` and ADR-013; approve or change the identity/session baseline.
9. Approve login/recovery methods, default film roles, administrator MFA policy and transactional-email ownership so real staging acceptance can proceed.
10. Review `docs/release/SPRINT_05_REPORT.md`, `docs/data/CANONICAL_MODEL.md` and ADR-014; approve or change the canonical content baseline.
