# Sprint 08 Report: Web Shell and Real Project Workflows

## 1. Executive Summary
- **Sprint Target**: Sprint 08 — Web Shell and Real Project Workflows (First sprint of Gate G2: Professional Web Core).
- **Status**: Completed and fully verified with Next.js App Router compilation, database-backed workflow suite (`scripts/test-web-project-workflows.ts`), and repository-wide automated verification (`pnpm check` exiting with code 0).

---

## 2. Deliverables & Implementations

### Multi-lingual Localization Engine (`packages/localization`)
- Added comprehensive UI translation dictionaries across all 8 required application languages:
  - Telugu (`te`), English (`en`), Hindi (`hi`), Tamil (`ta`), Kannada (`kn`), Malayalam (`ml`), Bengali (`bn`), and Marathi (`mr`).
- Added pure `getTranslations(locale)` engine with fallback to the primary application language (`te`).
- Added unit tests in `packages/localization/test/localization.test.ts` (100% passed).

### Contracts & API Client (`packages/contracts`, `packages/api-client`)
- Added `filmStatusSchema` and `filmResourceSchema` to shared contracts.
- Extended API client with typed methods:
  - `getMe()`: Session retrieval.
  - `listFilms()`: Accessible films listing.
  - `getFilm(filmId)`: Single film lookup.
  - `createFilm(organizationId, title)`: New film creation.
  - `archiveFilm(filmId)`: Transition project status to `archived`.
  - `restoreFilm(filmId)`: Transition project status back to `active`.

### Backend Tenant & Lifecycle Endpoints (`apps/api`)
- Extended `PostgresTenantRepository`, `TenantService`, and `TenantController`:
  - `GET /films/:filmId`: Details retrieval protected by active film membership.
  - `POST /films/:filmId/archive`: Film archival restricted by ownership and `film.archive` permission, with security audit logging (`film.archive`).
  - `POST /films/:filmId/restore`: Film restoration restricted by ownership and `film.archive` permission, with security audit logging (`film.restore`).
- Unit tests added in `apps/api/test/tenant.service.test.ts` verifying archive, restore, and audit records (34/34 tests passed).

### Next.js App Router Web Shell (`apps/web`)
- **Shell Architecture & Providers (`apps/web/app/providers.tsx`)**:
  - `LocaleContext` & `useLocale`: Dynamic locale switching with persistence and automatic `document.documentElement.lang` synchronisation.
  - `SessionContext` & `useSession`: Background session recovery against `/me/session` and session management.
  - `OfflineContext` & `useOffline`: Real-time network status tracking via `navigator.onLine` and `online`/`offline` window events.
- **Accessible UI Components**:
  - `Header`: Semantic landmark with accessible locale switcher, offline status indicator, and authenticated session state.
  - `SkipLink`: Accessible skip link (`#main-content`) for keyboard-first navigation.
  - `OfflineBanner`: High-priority status banner with `aria-live="polite"` announcing offline/online transitions.
  - `Modal`: Accessible dialog supporting focus trap, backdrop click, and Escape-key closure (`role="dialog"`, `aria-modal="true"`).
- **Real Project Workflows**:
  - `DashboardPage` (`apps/web/app/page.tsx`):
    - Tab navigation (`role="tablist"`, `aria-selected`) separating Active Projects and Archived Projects.
    - Project creation modal with title validation.
    - Project cards with "Open Workspace", "Archive", and "Restore" actions.
    - Accessible loading skeletons, error states with retry, and contextual empty states.
  - `FilmWorkspacePage` (`apps/web/app/films/[filmId]/page.tsx`):
    - Breadcrumb navigation (`<nav aria-label="Breadcrumb">`) to return to projects dashboard.
    - Canonical document creation modal with Kind (`screenplay`, `treatment`, `bible`, `notes`) and Language (`te`, `hi`, `en`, etc.) selection.
    - Document listing with version badges and status indicators.
- **Design Tokens & Styling (`apps/web/app/styles.css`)**:
  - Implemented dark palette conforming to design tokens (`#0b0e14`, `#151a23`, `#f5f7fb`, `#aab3c2`, `#f3b74f`, `#e85d68`).
  - Strict visible focus rings (`:focus-visible` with 2px accent outline and offset).
  - Responsive layout for mobile, tablet, and desktop viewports.

---

## 3. Automated Verification Evidence
- `pnpm db:test:web` (`scripts/test-web-project-workflows.ts`):
  - Verified project creation via `TenantService.createFilm`.
  - Verified active project listing and retrieval via `getFilm`.
  - Verified archival transition (`archiveFilm`) and security audit entry `film.archive`.
  - Verified restoration transition (`restoreFilm`) and security audit entry `film.restore`.
  - Verified canonical document creation (`ContentService.createDocument`) with client-generated UUIDs and version 1.
  - Verified document listing (`listDocuments`).
  - Verified cross-tenant isolation: non-members are blocked from viewing, archiving, or listing films and documents.
  - Verified complete localization strings across all 8 supported languages.
- `next build`:
  - Static generation of `/`, `/_not-found`, `/auth/complete`.
  - Dynamic route generation for `/films/[filmId]`.
  - Zero build errors, zero TypeScript errors.
- `pnpm check`:
  - Framework boundaries: verified.
  - Secrets scan: 235 files clean.
  - Config: 4 YAML files valid.
  - ESLint: 0 errors, 0 warnings across all apps, packages, workers, and scripts.
  - Typecheck: 15/15 projects passed.
  - Database suites (migration, canonical, sync, jobs, web): 100% passed.
  - Unit tests: 58/58 passed.

