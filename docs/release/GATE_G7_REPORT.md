# Release Gate G7 Signoff Report: Production Operations

## Overview
- **Gate**: G7 — Production Operations
- **Sprints Included**:
  - **Sprint 28**: Production Breakdown (`docs/release/SPRINT_28_REPORT.md`)
  - **Sprint 29**: Scheduling and Stripboard (`docs/release/SPRINT_29_REPORT.md`)
  - **Sprint 30**: Budget and Production Reporting (`docs/release/SPRINT_30_REPORT.md`)
- **Status**: SIGNED OFF AND VERIFIED
- **Date**: 2026-11-15

## Core Architectural Guarantees Achieved
1. **Production Breakdown & User Edit Protection**:
   - 13 comprehensive production categories (`cast`, `location`, `props`, `costumes`, `makeup_hair`, `vehicles`, `stunts`, `special_effects`, `visual_effects`, `sound_music`, `animals`, `special_equipment`, `art_department`).
   - Scene breakdown sheets with 1/8th page measurements (`page_eighths`), estimated shoot timings, dramatic/script day identifiers, and locking workflows.
   - Script-extracted breakdown items retain evidence text quotes from the screenplay and enforce `user_amended = true` protections so automated re-extractions never silently overwrite human producer edits.
2. **Deterministic Scheduling, Stripboard, and Conflict Management**:
   - Multi-version shooting schedules with formal producer approval workflows.
   - Daily production call sheets with call/wrap times and primary locations.
   - Stripboard strips (scenes, day banners, company moves, meal breaks, turnarounds) with collision-free, two-pass reordering along the board.
   - Availability constraint tracking (actor blackouts, location permits, daylight limits, equipment availability).
   - Conflict detection with documented manual override audit trail (`override_reason`, `overridden_by`, `overridden_at`).
3. **INR-First Film Budgeting & Mathematical Precision**:
   - All financial figures stored in integer paise/cents (`bigint`) to avoid floating-point rounding errors.
   - Chart of accounts structured across Above The Line, Below The Line Production, Below The Line Post, and Other Production.
   - Configurable rate cards with standard rates, overtime hourly rates, and currency tracking.
   - Formula-accurate Top Sheet calculations: subtotal, contingency percentage, and tax/GST percentage computed with exact mathematical verification.
   - Persisted snapshot reports and multi-tier CSV exports with formatted summaries.
4. **Multi-Tenant Row-Level Security (RLS)**:
   - Full RLS isolation enforced across all 9 production tables (`production_elements`, `scene_breakdown_sheets`, `scene_breakdown_items`, `shooting_schedules`, `schedule_shoot_days`, `schedule_strips`, `schedule_constraints`, `schedule_conflicts`, `production_budgets`, `production_rate_cards`, `budget_line_items`, `production_cost_reports`).
   - Verified by automated intrusion tests in `db:test:breakdown`, `db:test:scheduling`, and `db:test:budget`.
