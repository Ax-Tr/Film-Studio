# Sprint 28 Report: Production Breakdown (Gate G7)

## Summary
- **Sprint Target**: Production Breakdown (Locations, Cast, Props, Costumes, Vehicles, Scene Breakdown Sheets, 1/8th Page Timings, User Edit Protection, Locking).
- **Status**: Completed & Verified.
- **Date**: 2026-11-15

## Key Deliverables
1. **Database Schema & Migrations**:
   - `infra/database/migrations/0012_production_breakdown.sql`:
     - `production_elements`: Tracks 13 production categories (`cast`, `location`, `props`, `costumes`, `makeup_hair`, `vehicles`, `stunts`, `special_effects`, `visual_effects`, `sound_music`, `animals`, `special_equipment`, `art_department`) with element codes, descriptions, estimated costs in cents, and approval flags.
     - `scene_breakdown_sheets`: Scene-level production timing sheets tracking 1/8th page measurements (`page_eighths`), estimated shoot minutes, dramatic/script day identifiers, synopses, setup notes, and locking workflows (`draft`, `reviewed`, `locked`, `ready_for_scheduling`).
     - `scene_breakdown_items`: Maps production elements into specific scene sheets with required quantities, notes, evidence quotes from screenplay text, and explicit `user_amended` protection (guaranteeing automated script extraction never silently overwrites human producer edits).
     - Row-Level Security (RLS) policies enforcing multi-tenant isolation via `app_security.has_active_film_membership(film_id)` and permission-checked edits via `app_security.has_film_permission(film_id, 'film.documents.edit')`.
2. **Contracts & DTOs**:
   - `packages/contracts/src/index.ts`:
     - Elements: `productionElementCategorySchema`, `productionElementSchema`, `createProductionElementSchema`, `updateProductionElementSchema`.
     - Sheets: `sceneBreakdownStatusSchema`, `sceneBreakdownSheetSchema`, `upsertSceneBreakdownSheetSchema`.
     - Items & Full Sheet: `breakdownItemSourceOriginSchema`, `sceneBreakdownItemSchema`, `addSceneBreakdownItemSchema`, `sceneBreakdownFullSheetSchema`.
3. **Repository Layer**:
   - `apps/api/src/database/postgres-breakdown.repository.ts`:
     - `PostgresBreakdownRepository`: `createProductionElement`, `getProductionElement`, `listProductionElements`, `updateProductionElement`, `upsertSceneBreakdownSheet`, `getSceneBreakdownSheet`, `lockSceneBreakdownSheet`, `addBreakdownItem`, `updateBreakdownItem`, `removeBreakdownItem`, `listBreakdownSheets`.
4. **Verification & Integration Test Suite**:
   - `scripts/test-production-breakdown.ts` registered as `pnpm db:test:breakdown`.
   - Verified 8 core behaviors:
     - Production element creation with Telugu NFC text across categories.
     - Category filtering on production elements.
     - Scene breakdown sheet creation with page 1/8ths and shoot timings.
     - Elements linked to scene sheets with evidence quotes.
     - User edit protection flag (`user_amended`) preventing automated overwrites.
     - Full breakdown sheet query with joined element metadata.
     - Scene breakdown sheet locking with user and timestamp audit.
     - Multi-tenant RLS isolation preventing unauthorized tenant access.
