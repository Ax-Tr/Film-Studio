# Sprint 11 Release Report: Web Characters, Scenes, and Search

**Delivery Date:** 2026-11-14  
**Status:** COMPLETE & VERIFIED  
**Gate:** G2 (Professional Web Core) — Milestone 4/4  

---

## 1. Executive Summary

Sprint 11 completes the web writing core capabilities specified under Epic E02 (Screenplay Core), E03 (Narrative & Story Intelligence), and E14 (Search & Knowledge Management) within Gate G2.

The implementation introduces:
1. **Character Management System**: Full CRUD with aliases, character voice traits, arc summaries, and typed character-to-character relationships (mentorship, rivalry, family, romance).
2. **Materialized Scene Appearances & Dialogue Tracking**: Projections linking characters to scene occurrences with aggregated dialogue block counts and spoken word metrics.
3. **Interactive Scene Board**: Visual card-based index with scene reordering (monotonic position maintenance), individual scene locking/unlocking, sluglines, times-of-day, and synopsis previews.
4. **Unicode-Aware Global Search**: Substring and alias-matching search across character names, scene headings/synopses, and projected screenplay dialogue blocks with NFC normalization (handling Indic scripts such as Telugu and Devanagari natively).
5. **8-Language Localization Expansion**: Full translation coverage across all 8 supported Indian and global languages (`te`, `en`, `hi`, `ta`, `kn`, `ml`, `bn`, `mr`).

---

## 2. Key Deliverables & Architecture

### A. Database Migration (`infra/database/migrations/0005_characters_scenes_search.sql`)
- Added `aliases`, `voice_traits`, and `arc_summary` columns to `characters`.
- Created `character_relationships` table with source/target foreign keys, relationship types, descriptions, and audit timestamps.
- Added scene metadata enhancements to `scenes`: `slugline`, `time_of_day`, `setting_location`, `summary`, `is_locked`, `locked_by`, and `locked_at`.
- Created `scene_character_appearances` table projecting character occurrences per scene with `dialogue_block_count` and `dialogue_word_count`.
- Enforced PostgreSQL Row-Level Security (RLS) on all new tables via `app_security.has_active_film_membership()` and `app_security.has_film_permission('film.documents.edit')`.

### B. Contracts & API Client (`packages/contracts`, `packages/api-client`)
- Contract schemas: `characterResourceSchema`, `createCharacterSchema`, `updateCharacterSchema`, `characterRelationshipSchema`, `sceneCardResourceSchema`, `reorderScenesSchema`, `lockSceneSchema`, and `globalSearchResponseSchema`.
- Client methods in `@film-studio/api-client`: `createCharacter()`, `listCharacters()`, `getCharacter()`, `updateCharacter()`, `deleteCharacter()`, `addCharacterRelationship()`, `listCharacterRelationships()`, `listSceneCards()`, `reorderScenes()`, `updateSceneMetadata()`, `lockScene()`, and `globalSearch()`.

### C. Backend Domain & Repositories (`apps/api`)
- `PostgresCharacterRepository`: Transactional character management, conflict-free scene reordering with intermediate offsets, appearance rollup aggregation, and Unicode-normalized queries.
- `CharacterService`: Permission checking (`film.documents.read`, `film.documents.edit`), audit logging with strict scalar metadata typing, and tenant boundary enforcement.
- `CharacterController`: NestJS REST endpoints for `/v1/films/:filmId/characters`, relationships, scene cards, lock/reorder, and `/v1/films/:filmId/search`.

### D. Next.js App Router Web Pages (`apps/web`)
- **Characters Management (`apps/web/app/films/[filmId]/characters/page.tsx`)**: Responsive card grid displaying character profiles, aliases, arc summaries, and dialogue statistics pills, with an accessible creation modal.
- **Scene Board (`apps/web/app/films/[filmId]/documents/[documentId]/board/page.tsx`)**: Visual production board showing numbered cards, reorder arrows, lock/unlock toggles, character chips, and word count totals.
- **Global Search (`apps/web/app/films/[filmId]/search/page.tsx`)**: Instant debounced search interface with type filters (`all`, `character`, `scene`, `dialogue`) and direct deep-linking to screenplay documents.
- **Workspace Navigation Update (`apps/web/app/films/[filmId]/page.tsx`)**: Added quick access header buttons to Global Search and Characters, plus direct scene board links from each document card.

---

## 3. Automated Verification

- **Automated Integration Suite (`scripts/test-characters-scenes-search.ts` / `pnpm db:test:characters`)**:
  - Bootstraps clean PostgreSQL instance with migrations `0001` through `0005`.
  - Creates characters with mixed Telugu/English script names and aliases (`సూర్య (Surya)`, `బాస్`).
  - Creates structured character relationships (`mentor-mentee`) and queries them.
  - Records scene appearances and verifies aggregated character metrics (`totalScenes`, `totalDialogueBlocks`, `totalDialogueWords`).
  - Verifies scene card listing, scene locking/unlocking with audit timestamps, and constraint-safe scene reordering.
  - Verifies Unicode-aware global search across characters, aliases, scenes, and dialogue block text.
  - Confirms cross-film tenant isolation under negative access attempts.
- **Full Program Quality Check (`pnpm check`)**:
  - Boundary verification: 15/15 packages clean.
  - Secret scanner: 262 repository files scanned, 0 secrets found.
  - Config validation: 4/4 YAML configurations verified.
  - ESLint: 0 warnings, 0 errors across web, api, packages, scripts.
  - Next.js production build: Turbopack generated all 9 application routes cleanly.
  - TypeScript typechecking: All 15 packages passed with 0 errors.
  - Database suites: All 8 integration test suites passed cleanly.
  - Vitest test runner: 9/9 suites passed, 34/34 tests passed.

