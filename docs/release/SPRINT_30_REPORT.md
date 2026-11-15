# Sprint 30 Report: Budget and Production Reporting (Gate G7 Exit)

## Summary
- **Sprint Target**: Budget and Production Reporting (INR-First Rate Cards, Line Items, Chart of Accounts, Contingency/Tax Policies, Top Sheet Formulas, Variance Tracking, CSV/XLSX Exports).
- **Status**: Completed & Verified.
- **Date**: 2026-11-15

## Key Deliverables
1. **Database Schema & Migrations**:
   - `infra/database/migrations/0014_budget_and_production_reporting.sql`:
     - `production_budgets`: Versioned master and block production budgets with currency tracking (INR-first), configurable contingency percentages (e.g. 10%), tax percentages (18% Indian GST), status lifecycle (`draft`, `review`, `locked`, `approved`, `archived`), and formal producer approval auditing (`approved_by`, `approved_at`).
     - `production_rate_cards`: Standardized departmental rate cards across all 4 production tiers (`above_the_line`, `below_the_line_production`, `below_the_line_post`, `other_production`) with unit pricing (`daily`, `hourly`, `weekly`, `flat`, `per_item`, `per_scene`), overtime hourly increments, and currency preservation.
     - `budget_line_items`: Line-level accounting items with account codes, quantities, unit rates, fringe benefit percentages, multi-tier range estimates (low, estimated total, high), actual expense tracking, and assumptions notes.
     - `production_cost_reports`: Persisted financial snapshot reports (`top_sheet`, `budget_variance`, `cost_to_complete`, `detailed_ledger`) storing calculated subtotals, contingency amounts, taxes, and grand totals with structured JSON payloads.
     - Row-Level Security (RLS) policies enforcing multi-tenant isolation across all 4 budget tables.
2. **Contracts & DTOs**:
   - `packages/contracts/src/index.ts`:
     - Budgets: `productionBudgetStatusSchema`, `productionBudgetCategorySchema`, `productionBudgetSchema`, `createProductionBudgetSchema`.
     - Rate Cards: `rateCardUnitSchema`, `productionRateCardSchema`, `createProductionRateCardSchema`.
     - Line Items: `budgetLineItemSchema`, `createBudgetLineItemSchema`.
     - Reports & Top Sheet: `costReportTypeSchema`, `productionCostReportSchema`, `topSheetCategorySummarySchema`, `budgetTopSheetDtoSchema`.
3. **Repository Layer**:
   - `apps/api/src/database/postgres-budget.repository.ts`:
     - `PostgresBudgetRepository`: `createBudget`, `getBudget`, `listBudgets`, `approveBudget`, `createRateCard`, `listRateCards`, `createLineItem`, `listLineItems`, `updateLineItemActual`, `getTopSheet` (formula-accurate mathematical calculation), `generateCostReport`, `generateCsvExport`.
4. **Verification & Integration Test Suite**:
   - `scripts/test-budget-reporting.ts` registered as `pnpm db:test:budget`.
   - Verified 9 core behaviors:
     - Production budget created with INR-first currency, version allocation, and tax policy.
     - Production rate cards created across tiers with standard and overtime rates.
     - Budget line items created with automated fringe calculations and estimates.
     - Actual cost logging and variance tracking.
     - Top Sheet formula calculations verified with exact mathematical precision.
     - Budget approval workflow completed.
     - Production cost report snapshot generated and persisted.
     - Multi-tier CSV budget export generated with formula summaries.
     - Multi-tenant RLS isolation verified.
