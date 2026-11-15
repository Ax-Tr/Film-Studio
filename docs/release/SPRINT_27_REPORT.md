# Sprint 27 Report: AI Film Development and Pitches (Gate G6 Exit)

## Summary
- **Sprint Target**: AI Film Development, Coverage Reports, Pitch Packages, Provenance, Scene Citations, and Human Review.
- **Status**: Completed & Verified.
- **Date**: 2026-11-15

## Key Deliverables
1. **Database Schema & Migrations**:
   - `infra/database/migrations/0011_ai_film_development.sql`:
     - `ai_coverage_reports`: Structured analytical breakdown of screenplays (ratings 1-10 across premise, character, dialogue, pacing, commercial viability), overall recommendations (`pass`, `consider`, `recommend`), strengths and weaknesses arrays, scene citations with sluglines and notes, harm evaluation audit, and human review status tracking (`unreviewed`, `accepted`, `amended`, `rejected`).
     - `ai_pitch_packages`: Commercial pitch materials including title, logline, genre/tone, target audience, comparable films, character breakdowns with casting prototypes, 3-act summaries with key hooks, visual palette notes, budget tiering (`micro`, `low`, `mid`, `high`, `tentpole`), and director approval workflow (`draft`, `reviewed`, `director_approved`, `producer_ready`).
     - Row-Level Security (RLS) policies enforcing multi-tenant isolation via `app_security.has_active_film_membership(film_id)` and permission-checked edits via `app_security.has_film_permission(film_id, 'film.documents.edit')`.
2. **Contracts & DTOs**:
   - `packages/contracts/src/index.ts`:
     - Coverage: `aiCoverageRecommendationSchema`, `aiHarmEvalStatusSchema`, `aiHumanReviewStatusSchema`, `aiSceneCitationSchema`, `aiModelProvenanceSchema`, `aiCoverageReportSchema`, `createAiCoverageReportSchema`, `reviewAiCoverageReportSchema`.
     - Pitch packages: `aiBudgetTierSchema`, `aiPitchReviewStatusSchema`, `aiCharacterBreakdownSchema`, `aiActSummarySchema`, `aiPitchPackageSchema`, `createAiPitchPackageSchema`, `reviewAiPitchPackageSchema`.
3. **Repository Layer**:
   - `apps/api/src/database/postgres-ai-film-dev.repository.ts`:
     - `PostgresAiFilmDevRepository`: `createCoverageReport`, `getCoverageReport`, `listCoverageReports`, `reviewCoverageReport`, `createPitchPackage`, `getPitchPackage`, `listPitchPackages`, `reviewPitchPackage`.
4. **Verification & Integration Test Suite**:
   - `scripts/test-ai-film-development.ts` registered as `pnpm db:test:aifilmdev`.
   - Verified 6 core behaviors:
     - AI Coverage report creation with Telugu NFC text, ratings, and scene citations.
     - Coverage human review workflow (`unreviewed` -> `accepted` with reviewer notes).
     - AI Pitch Package creation with character breakdowns, act summaries, and budget tiering.
     - Pitch Package human review transition to `director_approved`.
     - Film-level listing queries for coverage and pitch packages.
     - Multi-tenant RLS isolation preventing cross-organization leakage.
