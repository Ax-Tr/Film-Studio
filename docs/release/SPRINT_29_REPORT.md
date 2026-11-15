# Sprint 29 Report: Scheduling and Stripboard (Gate G7)

## Summary
- **Sprint Target**: Shooting Schedules, Stripboard/Order, Shoot Days, Availability/Constraint Model, Proposed Optimizations, Manual Overrides, Conflict Explanations, Versioning, and Approval Lifecycle.
- **Status**: Completed & Verified.
- **Date**: 2026-11-15

## Key Deliverables
1. **Database Schema & Migrations**:
   - `infra/database/migrations/0013_scheduling_stripboard.sql`:
     - `shooting_schedules`: Multi-version master and block schedules with start/end dates, estimated shoot days, status lifecycle (`draft`, `review`, `approved`, `archived`), and formal producer approval tracking (`approved_by`, `approved_at`).
     - `schedule_shoot_days`: Daily production call sheets with call/wrap times, primary location names, and operational notes.
     - `schedule_strips`: Production stripboard strips supporting scene strips, day banners, company moves, meal breaks, and turnarounds with 1/8th page counts, estimated shoot minutes, INT/EXT and DAY/NIGHT classifications, and cast assignments. Unique strip order with deferrable constraints.
     - `schedule_constraints`: Blackout windows, location permits, daylight limits, and equipment availability constraints (`actor_blackout`, `location_permit`, `daylight_window`, `equipment_availability`, `weather_window`).
     - `schedule_conflicts`: Explanations of schedule violations with proposed resolutions and documented manual overrides (`is_overridden`, `override_reason`, `overridden_by`, `overridden_at`).
     - Row-Level Security (RLS) policies enforcing multi-tenant isolation across all 5 scheduling tables.
2. **Contracts & DTOs**:
   - `packages/contracts/src/index.ts`:
     - Schedules: `scheduleStatusSchema`, `shootingScheduleSchema`, `createShootingScheduleSchema`.
     - Days: `scheduleShootDaySchema`, `createScheduleShootDaySchema`.
     - Strips: `scheduleStripTypeSchema`, `scheduleIntExtSchema`, `scheduleDayNightSchema`, `scheduleStripSchema`, `createScheduleStripSchema`.
     - Constraints: `scheduleConstraintTypeSchema`, `scheduleConstraintSchema`, `createScheduleConstraintSchema`.
     - Conflicts: `scheduleConflictTypeSchema`, `scheduleConflictSchema`, `createScheduleConflictSchema`, `overrideScheduleConflictSchema`.
     - Full Board: `shootingScheduleFullBoardDtoSchema`.
3. **Repository Layer**:
   - `apps/api/src/database/postgres-scheduling.repository.ts`:
     - `PostgresSchedulingRepository`: `createSchedule`, `getSchedule`, `listSchedules`, `approveSchedule`, `createShootDay`, `listShootDays`, `createStrip`, `listStrips`, `reorderStrips` (two-pass collision-free reordering), `createConstraint`, `listConstraints`, `recordConflict`, `overrideConflict`, `listConflicts`, `getFullBoard`.
4. **Verification & Integration Test Suite**:
   - `scripts/test-scheduling-stripboard.ts` registered as `pnpm db:test:scheduling`.
   - Verified 9 core behaviors:
     - Shooting schedule created with Telugu title and version allocation.
     - Shoot days created with call/wrap times and locations.
     - Stripboard strips created across banners and scene strips.
     - Stripboard strip reordering verified.
     - Availability constraint recorded.
     - Conflict recording and documented manual override with rationale.
     - Schedule approval lifecycle verified.
     - Full stripboard board assembly query verified.
     - Multi-tenant RLS isolation verified.
