# StoryForge Studio: Workspace Architecture & Directory Reorganization

This document details the top-level repository restructure dividing the codebase into dedicated workspaces: **`frontend/`**, **`backend/`**, **`android/`**, and **`ios/`**.

---

## 1. Top-Level Workspace Structure

```
.
├── frontend/             # Next.js 16.4.6 Web Application Shell
├── backend/              # NestJS Modular API & Database Repositories
├── android/              # Dedicated Android Application Workspace (Expo / React Native 0.76)
├── ios/                  # Dedicated iOS Application Workspace (Expo / React Native 0.76)
├── packages/             # Framework-Neutral Domain & Utility Packages
│   ├── api-client/       # Typed REST client with automatic token refreshing
│   ├── auth-client/      # OIDC PKCE authentication helpers
│   ├── contracts/        # Canonical Zod schemas and DTOs across all 19 modules
│   ├── design-tokens/    # Theme tokens, typography, and styling variables
│   ├── domain/           # Core domain business logic and permission rules
│   ├── editor-bridge/    # ProseMirror screenplay model bindings, keyboard handling, a11y
│   ├── localization/     # Indic translations (8 languages: te, hi, en, ta, kn, ml, bn, mr)
│   ├── pagination/       # Deterministic screenplay layout, page splitting, import/export
│   ├── screenplay-model/ # Canonical AST nodes, JSON schemas, and block validations
│   ├── sync-core/        # Offline sync protocol, state vectors, conflict algorithms
│   └── test-fixtures/    # Screenplay corpora, Telugu sample scripts, test seeds
├── workers/              # Distributed Background Processing
│   └── jobs/             # BullMQ / Job worker for export, AI processing, quarantine
├── infra/                # Infrastructure & Database
│   ├── database/         # 19 Forward SQL Migrations (PostgreSQL 17 + RLS tenant isolation)
│   └── docker/           # Compose specifications for Redis, PostgreSQL, Object Storage
├── scripts/              # 33 Integration & Verification Test Suites (pnpm check)
└── docs/                 # Release manifests, gate reports (G0–G9), ADRs, PRDs
```

---

## 2. Directory Breakdown

### 2.1 `frontend/` (Next.js 16 Web Application)
- **Path**: `frontend/`
- **Package Name**: `@film-studio/web`
- **Key Modules**:
  - `app/layout.tsx`, `app/providers.tsx`: Web shell, providers, session lifecycle.
  - `app/page.tsx`: Studio dashboard, active/archived film projects.
  - `app/films/[filmId]/page.tsx`: Workspace hub, document navigation, character & search links.
  - `app/films/[filmId]/documents/[documentId]/page.tsx`: 18-block ProseMirror screenplay writing core.
  - `app/films/[filmId]/documents/[documentId]/board/page.tsx`: Visual scene board and act cards.
  - `app/films/[filmId]/documents/[documentId]/revisions/page.tsx`: Revision history, lock/freeze, color tiers.
  - `app/films/[filmId]/characters/page.tsx`: Character profiles, dialect voice, relationship maps.
  - `app/films/[filmId]/story/page.tsx`: Story bible, loglines, narrative beat sheets.
  - `app/films/[filmId]/search/page.tsx`: Debounced full-text search across dialogue, characters, scenes.
  - `app/films/[filmId]/sync/page.tsx`: Client sync center, pending offline outbox, conflict inspector.
  - `public/sw.js`, `public/manifest.json`: Progressive Web App (PWA) offline service worker.

---

### 2.2 `backend/` (NestJS Modular API)
- **Path**: `backend/`
- **Package Name**: `@film-studio/api`
- **Key Modules**:
  - `src/main.ts`, `src/app.module.ts`: Modular server bootstrap, global exception filters.
  - `src/health.controller.ts`: Liveness & readiness probes for zero-downtime orchestration.
  - `src/modules/auth/`: OIDC PKCE transaction handling, secure session cookie rotation.
  - `src/modules/tenant/`: Organization lifecycle, film creation, RLS tenant isolation.
  - `src/modules/content/`: Screenplay documents, scenes, character repository.
  - `src/modules/sync/`: Authoritative revision allocation, CRDT conflict reconciliation.
  - `src/modules/files-jobs/`: Object storage presigned URLs, asynchronous job queuing.
  - `src/modules/ai/`: KMS envelope encryption, LLM proposal gateway, cost ceilings.
  - `src/database/`: 16 Typed PostgreSQL repositories:
    - `postgres-content.repository.ts`: Canonical screenplay AST persistence.
    - `postgres-sync.repository.ts`: Revision sequence allocation and tombstone compaction.
    - `postgres-character.repository.ts`: Character arcs, relationships, dialogue stats.
    - `postgres-story.repository.ts`: Story bible, loglines, synopses, beats.
    - `postgres-intelligence.repository.ts`: Character voice, scene tone/purpose.
    - `postgres-continuity.repository.ts`: Deterministic continuity rules, exceptions.
    - `postgres-ai-gateway.repository.ts`: Encrypted provider credentials, token caps.
    - `postgres-ai-proposal.repository.ts`: Version-pinned consent manifests, proposal decisions.
    - `postgres-ai-film-dev.repository.ts`: AI script coverage, pitch package generators.
    - `postgres-breakdown.repository.ts`: Production element sheets, timings.
    - `postgres-scheduling.repository.ts`: Shooting schedules, stripboard, constraints.
    - `postgres-budget.repository.ts`: INR-first rate cards, line items, multi-tier XLSX.
    - `postgres-collaboration.repository.ts`: Anchored comments, active presence tracking.
    - `postgres-film-admin.repository.ts`: Approval policies, ownership transfer, break-glass.
    - `postgres-enterprise-quota.repository.ts`: India residency, storage/AI token ceilings.
    - `postgres-knowledge.repository.ts`: GIN full-text search, Telugu dialect dictionary.
    - `postgres-interop.repository.ts`: Portfolio slate summaries, 7-format import/export.

---

### 2.3 `android/` (Dedicated Android Application)
- **Path**: `android/`
- **Package Name**: `@film-studio/android`
- **Target OS**: Android 15+ (API Level 35)
- **Key Modules**:
  - `app.json`: Android bundle ID `com.storyforgestudio.mobile`, deep link scheme `filmstudio://`.
  - `App.tsx`: Android shell root, navigation container, offline status banner.
  - `src/auth/android-auth-handler.ts`: Android Custom Tabs PKCE deep-link handler.
  - `src/storage/credential-storage.ts`: Android Keystore-backed encrypted credential persistence.
  - `src/database/mobile-database.ts`, `mobile-repository.ts`: SQLite offline outbox, canonical cache.
  - `src/editor/mobile-screenplay-editor-engine.ts`: Native Android virtualized screenplay input.
  - `src/editor/mobile-draft-persistence.ts`: Force-kill durability and crash recovery.
  - `src/sync/mobile-sync-coordinator.ts`: Background bidirectional sync and conflict handling.
  - `src/export/mobile-export-service.ts`: Local client-side PDF/FDX/Fountain generation.
  - `src/screens/ProjectDashboard.tsx`, `MobileScreenplayEditor.tsx`, `MobileSyncAndExportSheet.tsx`.

---

### 2.4 `ios/` (Dedicated iOS Application)
- **Path**: `ios/`
- **Package Name**: `@film-studio/ios`
- **Target OS**: iOS 16, 17, 18 (iPadOS tablet optimized)
- **Key Modules**:
  - `app.json`: iOS bundle ID `com.storyforgestudio.mobile`, Universal Links `applinks:storyforge.studio`, Face ID `NSFaceIDUsageDescription`, background fetch modes.
  - `App.tsx`: iOS shell root, SafeAreaView, gesture navigation.
  - `src/auth/ios-auth-handler.ts`: `ASWebAuthenticationSession` OIDC handler.
  - `src/storage/ios-keychain-storage.ts`: Hardware Keychain access with biometric access control.
  - `src/editor/ios-screenplay-editor-engine.ts`: Apple Pencil, Scribble, and CoreText layout integration.
  - `src/lifecycle/ios-lifecycle-manager.ts`: Background state saving, memory pressure mitigation.
  - `src/export/ios-export-share-service.ts`: AirDrop, Files UTI, and native UIActivityViewController.
  - `src/diagnostics/ios-diagnostics-service.ts`: Zero-leakage redaction, VoiceOver accessibility tags.

---

## 3. Verification & Monorepo Health

All monorepo package references, root scripts, ESLint file patterns, and 33 automated integration tests have been updated and verified:

```bash
# Verify boundaries, secrets, config, ESLint, TypeScript, and all 33 test suites
pnpm check
```
- **Exit Code**: `0`
- **ESLint**: 0 warnings across all workspaces (`--max-warnings=0`).
- **TypeScript**: 0 errors across 17 workspace projects.
- **Tests**: 33 PostgreSQL database integration suites + 9 Vitest suites all passing.
