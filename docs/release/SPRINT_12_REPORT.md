# Sprint 12 Release Report: Revisions, Import, Pagination, and Export

**Delivery Date:** 2026-11-14  
**Status:** COMPLETE & VERIFIED  
**Gate:** G2 (Professional Web Core) — Milestone 5/5  

---

## 1. Executive Summary

Sprint 12 delivers production-grade screenplay revision management, external script import (Fountain and plain text), deterministic Courier 12pt line pitch pagination, and multi-format document export (searchable PDF with watermarking and Fountain script files) under Epic E02 (Screenplay Core) and Epic E03 (Narrative & Story Intelligence).

The implementation satisfies all architectural guarantees:
1. **Immutable Historical Revisions & Non-Destructive Restore**: Historical versions stored in PostgreSQL with strict immutability triggers. Restoring a version creates a new snapshot without mutating historical revisions or interrupting drafts.
2. **Deterministic Screenplay Pagination Engine (`@film-studio/pagination`)**: Strict Courier 12pt monospace line estimation, margins (left 1.5", right 1.0", top/bottom 1.0"), dialogue/parenthetical bonding, and SHA256 checksums ensuring page-count consistency across platforms.
3. **Fountain & Plain Text Importer**: Conforming Fountain parsing with Title Page metadata recognition, character cue detection, transition mapping, parentheticals, and NFC Indic/Telugu script preservation.
4. **Binary PDF 1.4 Generator & Fountain Exporter**: Searchable PDF generation with custom watermark presets (`CONFIDENTIAL PREVIEW`), stream objects, cross-reference tables, and Courier font metric alignment.
5. **Full Web User Interface**: Revisions Drawer with snapshot previews and 1-click restore, dedicated Script Import view with diagnostic error reporting, and export controls embedded directly in the screenplay editor toolbar.
6. **Multi-Tenant RLS & 8-Language Localization**: Full row-level security isolation and complete translation coverage across `te`, `en`, `hi`, `ta`, `kn`, `ml`, `bn`, and `mr`.

---

## 2. Key Deliverables & Architecture

### A. Pagination Package (`packages/pagination`)
- **`paginator.ts`**: Screenplay paginator computing exact character indents (action: 60 chars, dialogue: 35 chars, character: 35 chars, parenthetical: 25 chars) and line heights, widow/orphan protection bonding scene headings to actions and characters to dialogue, and deterministic SHA256 page checksums.
- **`importer.ts`**: Fountain and plain text parser mapping scene headings, transitions, characters, parentheticals, and actions into canonical `ScreenplayDocument` AST (`scenes: Array<{ id, blocks }>`) with classified error reporting (`UNRECOGNIZED_ELEMENT`, `EMPTY_HEADING`, etc.).
- **`exporter.ts`**: PDF 1.4 binary engine generating compliant PDF documents with stream compression, watermarks, page numbering, and Fountain text serialization.
- **`test/pagination.test.ts`**: Unit test suite verifying parsing, pagination, PDF generation, and Fountain roundtrip text preservation.

### B. Contracts & API Client (`packages/contracts`, `packages/api-client`)
- Contract schemas: `documentVersionSummaryResourceSchema`, `documentVersionDetailResourceSchema`, `restoreDocumentVersionRequestSchema`, `importScriptRequestSchema`, and `importScriptResponseSchema`.
- Client methods in `@film-studio/api-client`: `importScript()`, `listDocumentVersions()`, `getDocumentVersion()`, `restoreDocumentVersion()`, and `exportDocument()`.

### C. Backend Domain & Repositories (`apps/api`)
- `PostgresContentRepository`:
  - `listDocumentVersions`: Queries `document_versions` table for metadata and SHA256 hashes.
  - `getDocumentVersion`: Retrieves full snapshot and version detail.
  - `restoreDocumentVersion`: Atomic transactional restore upserting scenes, resetting scene order, reprojecting screenplay blocks, and generating a new immutable snapshot row.
  - `importScript`: Atomic document and scene creation with block projections.
- `ContentService`:
  - Permission verification (`film.documents.read`, `film.documents.edit`).
  - Audit logging of `document.version.restore` and `document.import` actions.
  - Export handler generating PDF binaries or Fountain scripts with download headers.
- `ContentController`:
  - `POST /v1/films/:filmId/documents/import`
  - `GET /v1/films/:filmId/documents/:documentId/versions`
  - `GET /v1/films/:filmId/documents/:documentId/versions/:versionId`
  - `POST /v1/films/:filmId/documents/:documentId/versions/:versionId/restore`
  - `GET /v1/films/:filmId/documents/:documentId/export`

### D. Next.js App Router Web UI (`apps/web`)
- **Revisions View (`apps/web/app/films/[filmId]/documents/[documentId]/revisions/page.tsx`)**:
  - Version history sidebar displaying version numbers, timestamps, and SHA256 checksums.
  - Selected version snapshot preview with formatted script layout.
  - 1-click "Restore This Version" action with real-time feedback and editor redirection.
- **Script Import View (`apps/web/app/films/[filmId]/import/page.tsx`)**:
  - Drag-and-drop / file selector supporting `.fountain` and `.txt`.
  - Manual paste textarea and script metadata configuration.
  - Parsing validation banner reporting scene count, character count, and line diagnostic issues.
- **Screenplay Editor Integration (`apps/web/app/films/[filmId]/documents/[documentId]/page.tsx`)**:
  - Added Revisions and Export buttons to the editor topbar.
  - Interactive Export Modal supporting PDF download with watermark customization and Fountain file download.
- **Project Navigation (`apps/web/app/films/[filmId]/page.tsx`)**:
  - Added direct "Import Script" action to project workspace header.

---

## 3. Automated Verification

- **Automated Integration Suite (`scripts/test-revisions-import-export.ts` / `pnpm db:test:revisions`)**:
  - Bootstraps clean PostgreSQL instance with migrations `0001` through `0005`.
  - Imports Fountain script with Telugu dialogues (`మనం వేట ప్రారంభించాలి.`) and English cues.
  - Verifies scene count, character count, and block projections in database.
  - Verifies document version listing and snapshot SHA256 integrity.
  - Verifies deterministic Courier 12pt pagination checksums.
  - Creates document version 2, and restores version 1 as a new version 4, verifying strict immutability.
  - Exports document to PDF and verifies `%PDF-1.4` headers, watermark text, and `%%EOF` marker.
  - Exports document to Fountain and verifies Unicode text preservation.
  - Confirms multi-tenant RLS isolation against unauthorized user requests.
- **Full Program Quality Check (`pnpm check`)**:
  - Boundary verification: 15/15 packages clean.
  - Secret scanner: 270 repository files scanned, 0 secrets found.
  - Config validation: 4/4 YAML configurations verified.
  - ESLint: 0 warnings, 0 errors across web, api, packages, scripts.
  - Next.js production build: Turbopack generated all 11 application routes cleanly.
  - TypeScript typechecking: All 15 packages passed with 0 errors.
  - Database suites: All 9 integration test suites passed cleanly.
  - Vitest test runner: 9/9 suites passed, 34/34 tests passed.

