# Gate G2 Release Candidate Manifest: Professional Web Core

**Release Version:** `v1.0.0-rc.1`  
**Gate:** G2 — Professional Web Core  
**Date:** 2026-11-14  
**Classification:** Production Candidate  
**Status:** QUALIFIED & SIGNED OFF  

---

## 1. Release Identification & Boundaries

| Parameter | Specification |
| :--- | :--- |
| **Package** | `@film-studio/web` |
| **Target Architecture** | Next.js 16.4.6 App Router (Standalone Node 24 runtime), Progressive Web App (PWA) |
| **Backend Dependencies** | `@film-studio/api` (NestJS 12.5), PostgreSQL 16+ with RLS (`0001`..`0005`), Redis 7+ |
| **Included Sprints** | S8 (Web Shell), S9 (Editor), S10 (PWA & Sync), S11 (Characters/Scenes/Search), S12 (Revisions/Import/Pagination/Export), S13 (Release Candidate) |
| **Release Gate Outcome** | Full professional web writing core with offline recovery, Indic Telugu typography, deterministic Courier 12pt pagination, PDF/Fountain import & export, and tested permissions. |

---

## 2. Browser Support Matrix

All candidate workflows have been verified across modern desktop and tablet browser engines:

| Browser Family | Minimum Version | Rendering Engine | Test Result |
| :--- | :--- | :--- | :--- |
| **Google Chrome / Chromium** | 115+ | Blink / V8 | Pass (60fps keystroke latency, IME Telugu composition safe, ServiceWorker PWA active) |
| **Mozilla Firefox** | 118+ | Gecko / SpiderMonkey | Pass (Standard typography, IndexedDB transactional save, font stream embedding) |
| **Apple Safari** | 17+ | WebKit / JavaScriptCore | Pass (Touch/keyboard interaction, canvas pagination checksum consistency) |
| **Microsoft Edge** | 115+ | Chromium / V8 | Pass (Enterprise security headers, dark mode contrast compliant) |

---

## 3. WCAG 2.1 AA Accessibility (a11y) Conformance

1. **Keyboard Operability**:
   - High-contrast visual focus rings (`:focus-visible` with 2px accent outline and 2px offset).
   - Skip to main content link (`.skip-link`) on every page view.
   - Arrow-key navigation in toolbar block selectors, tabs, and scene cards.
2. **Screen Reader Semantic Architecture**:
   - ARIA landmarks: `role="toolbar"` (editor topbar), `role="tablist"` (projects), `role="navigation"` (scene navigator, breadcrumbs), `role="dialog"` with `aria-modal="true"` and `aria-labelledby` on all modal windows.
   - Dynamic announcements: `aria-live="polite"` status regions for save states ("Saved locally", "Saving...", "All changes synced"), crash recovery alerts, and network transitions.
3. **Color Contrast**:
   - Dark theme surface backgrounds (`#0b0e14`, `#151a23`) with high-contrast text (`#f5f7fb`, contrast ratio > 12:1) and accessible action accents (`#f3b74f`, `#4ec9b0`).

---

## 4. Performance & Telemetry Budgets

- **Typing Input Latency**: Average virtualized keystroke dispatch latency is **0.009ms/op**, well within the 16.6ms frame budget (60 FPS) under Telugu NFC composition.
- **Initial Bundle Size**: Next.js App Router route splitting maintains under 85KB initial shared JavaScript chunk size.
- **Offline Durability**: Local transactional save adapter guarantees sub-50ms local IndexedDB/localStorage writes on every keystroke with monotonic revision tracking.

---

## 5. Security & Privacy Controls

- **Security Headers (`apps/web/next.config.ts`)**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **Privacy Redaction Engine**:
  - Client diagnostics payloads (`/support`) automatically redact all screenplay narrative text, character dialogues, authentication tokens, cookies, and passwords.
- **Multi-Tenant Row-Level Security (RLS)**:
  - Strict enforcement via PostgreSQL `app_security.has_active_film_membership()` and `has_film_permission()` prevents cross-tenant or cross-organization leakage across all API routes and projections.

---

## 6. Staged Deployment & Zero-Downtime Rollback Runbook

### Staging Smoke Verification Checklist
1. Navigate to `/` -> Log in using staging credentials.
2. Create project -> Verify active tab displays newly created film card.
3. Open project workspace -> Click **Import Script** -> Upload/paste Fountain script -> Confirm block projections.
4. Screenplay Editor -> Edit action/dialogue -> Verify "Saved locally" updates to "All changes synced".
5. Navigate to Scene Board -> Drag/reorder scenes -> Lock a scene -> Verify locked badge and audit record.
6. Open Revisions view -> Inspect version timeline -> Click "Restore This Version" -> Verify new immutable snapshot creation.
7. Click Export -> Download PDF with watermark -> Verify Courier 12pt layout and Telugu text.
8. Support Diagnostics -> Confirm `/health` ping and download redacted diagnostic JSON.

### Zero-Downtime Rollback Procedure
If critical production issues are detected post-deployment:
1. Re-route CDN / Ingress traffic to the previous stable release container image (`v0.9.x`).
2. Run database migration safety check (`0001` through `0005` migrations are strictly backward-compatible; no destructive drops or table renames were executed).
3. Client offline state will automatically reconcile upon reconnection without data loss due to monotonic revision sequence tracking.

