# STORYFORGE STUDIO — Requirements-to-Milestone Traceability

**Scope control:** The verbatim source master prompt is bundled as `SOURCE_MASTER_REQUIREMENTS.txt`. The mandatory web + Android + iOS update is in `PLATFORM_AMENDMENT.md`. This matrix allocates work; it is not a claim that any original feature has been built, removed or accepted.

| Original module | Milestone(s) | Acceptance evidence |
|---|---|---|
| 1 — Professional screenplay editor | M0, M2, M3, M4, M5 | Typed blocks, full Telugu draft, deterministic pages, device-specific input/export tests |
| 2 — Story development studio | M5 | Structured story, selectable narrative structures, card/list views |
| 3 — Character intelligence | M2, M5 | Character CRUD, relationships, voices, accurate appearances |
| 4 — Scene and sequence intelligence | M2, M5 | Stable IDs, move/recover/lock scenes, reports and analytics |
| 5 — Continuity engine | M5, M7 | Deterministic facts, scene-linked evidence and exceptions |
| 6 — AI intelligence engine | M6 | BYOK real providers, privacy previews, Telugu intelligence, cost and proposals |
| 7 — AI-powered film development | M6, M9 | Pitch, coverage and story documents with documented provenance |
| 8 — Production breakdown | M7 | Editable scene/element reports and schedule suggestions |
| 9 — Budget intelligence | M7 | Assumption-driven editable INR budgets, ranges and totals |
| 10 — Collaboration and revisions | M1, M2, M3, M4, M5, M8 | Sync safety early; real multi-writer approvals/roles later |
| 11 — Export | M0, M2, M3, M4, M7, M9 | Telugu PDF/DOCX initially; other formats incl. XLSX and validated FDX later |
| 12 — Project and portfolio management | M1, M2, M3, M4, M9 | Same account/projects across devices; portfolio reports |
| 13 — User experience and interface | M2, M3, M4, M5–M9 | Independent web/Android/iOS screen acceptance, accessibility, focus mode |
| 14 — Search and knowledge management | M2, M5, M9 | Telugu/character/scene query tests, isolated knowledge references |
| 15 — Security and IP protection | M0, M1 and every release | Threat tests, privacy controls, auth, backup/restore and owner export/delete |
| 16 — Import and migration | M2, M9 | Source preserved, parsing review, DOCX/PDF/Fountain/FDX checks |
| 17 — Performance and reliability | M0–M9 | Measured typing, save/recovery, retry, large-script and render budgets |
| 18 — Testing and QA | M0–M9 | Unit/integration/E2E + per-platform Telugu and security gates |
| 19 — Extensibility | M1, M8, M9 | Modular contracts, plugin boundaries, enterprise/billing compatibility |

## Mandatory platform matrix

| Platform requirement | Milestone | Mandatory release test |
|---|---|---|
| Responsive Next.js writing and film-development web app | M2 | Real login, scene edit, offline draft/recovery, export, role-aware UI |
| Dedicated Expo Android application | M3 | Signed APK/AAB; Kotlin/Android platform integrations as required; offline SQLite test |
| Dedicated Expo iOS application | M4 | Signed IPA/TestFlight; iOS keyboard/shaping/storage; offline SQLite test |
| Same identity and canonical projects | M1–M4 | Cross-device create/change/read, no cross-project leakage |
| Shared validation, domain logic, type definitions and API client | M1 | Contract tests across all application entry points |
| Reliable conflict resolution | M1–M4, M8 | Concurrent text, same-field collision, delete-vs-edit, stale device recovery |
| Telugu Unicode, layout and export per platform | M0, M2–M4 | Golden input/shaping/copy/PDF checks independently for web/Android/iOS |
| Backend-held provider AI keys | M6 | No secrets in frontend or device; audit usage and approval |
| Subscriptions, teams and enterprise extensibility | M1, M8–M9 | Stable entities, entitlement tests and tenant isolation |
| Non-dummy release behavior | Every milestone | Every shipped action persists, handles error/loading states, produces observable results |

## Original acceptance criteria A–O preserved

A: offline Telugu project creation (after installed/app cached and session established); B: typed screenplay; C: Telugu Unicode editor + PDF; D: stable scene IDs under move; E: correct appearances/dialogue counts; F: deterministic continuity checks; G: secure provider configuration; H: actual provider analysis; I: reviewed AI edits; J: usable XLSX production reports; K: crash recovery; L: user/project isolation; M: no critical security findings; N: automated + manual workflow verification; O: no LLM dependency for core operation.

**Explicit revision note:** First-ever web or mobile sign-in needs an internet connection. Once the client is provisioned and the account session is locally usable, locally created projects can be queued and synchronized later. This is how original criterion A is implemented within mandatory shared-cloud identity architecture; it is not interpreted as anonymous cloud account registration without a network.
