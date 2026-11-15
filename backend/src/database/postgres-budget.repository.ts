import type { Pool, PoolClient } from 'pg';
import type {
  ProductionBudgetDto,
  CreateProductionBudgetDto,
  ProductionRateCardDto,
  CreateProductionRateCardDto,
  BudgetLineItemDto,
  CreateBudgetLineItemDto,
  BudgetTopSheetDto,
  TopSheetCategorySummaryDto,
  ProductionCostReportDto,
  CostReportType,
  ProductionBudgetCategory,
} from '@film-studio/contracts';

export class PostgresBudgetRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a production budget with auto-versioning
  async createBudget(
    data: CreateProductionBudgetDto,
    createdBy: string,
    client?: PoolClient,
  ): Promise<ProductionBudgetDto> {
    const versionRes = await this.getExecutor(client).query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM production_budgets WHERE film_id = $1`,
      [data.filmId],
    );
    const nextVer = Number(versionRes.rows[0].next_ver);

    const res = await this.getExecutor(client).query(
      `INSERT INTO production_budgets (
         film_id, schedule_id, title, version_number, currency,
         contingency_percentage, tax_percentage, status, notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
       RETURNING *`,
      [
        data.filmId,
        data.scheduleId ?? null,
        data.title,
        nextVer,
        data.currency ?? 'INR',
        data.contingencyPercentage ?? 10.0,
        data.taxPercentage ?? 18.0,
        data.notes ?? null,
        createdBy,
      ],
    );
    return this.mapBudgetRow(res.rows[0]);
  }

  // 2. Get budget by ID
  async getBudget(
    id: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ProductionBudgetDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT b.* FROM production_budgets b
       WHERE b.id = $1 AND b.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = b.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [id, filmId],
    );
    if (res.rows.length === 0) return null;
    return this.mapBudgetRow(res.rows[0]);
  }

  // 3. List budgets for a film
  async listBudgets(
    filmId: string,
    client?: PoolClient,
  ): Promise<ProductionBudgetDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT b.* FROM production_budgets b
       WHERE b.film_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = b.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY b.version_number DESC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapBudgetRow(row));
  }

  // 4. Approve budget
  async approveBudget(
    id: string,
    filmId: string,
    approvedBy: string,
    client?: PoolClient,
  ): Promise<ProductionBudgetDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE production_budgets
       SET status = 'approved',
           approved_by = $1,
           approved_at = now(),
           updated_at = now()
       WHERE id = $2 AND film_id = $3
       RETURNING *`,
      [approvedBy, id, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Budget ${id} not found or access denied`);
    }
    return this.mapBudgetRow(res.rows[0]);
  }

  // 5. Create rate card
  async createRateCard(
    data: CreateProductionRateCardDto,
    client?: PoolClient,
  ): Promise<ProductionRateCardDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO production_rate_cards (
         film_id, name, category, rate_unit, standard_rate_cents,
         overtime_rate_cents, currency, notes, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.filmId,
        data.name,
        data.category,
        data.rateUnit,
        data.standardRateCents,
        data.overtimeRateCents ?? null,
        data.currency ?? 'INR',
        data.notes ?? null,
        data.isActive ?? true,
      ],
    );
    return this.mapRateCardRow(res.rows[0]);
  }

  // 6. List rate cards for a film
  async listRateCards(
    filmId: string,
    client?: PoolClient,
  ): Promise<ProductionRateCardDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT rc.* FROM production_rate_cards rc
       WHERE rc.film_id = $1 AND rc.is_active = true
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = rc.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY rc.category ASC, rc.name ASC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapRateCardRow(row));
  }

  // 7. Create line item (formula: estimated_total = quantity * unit_rate * (1 + fringe/100))
  async createLineItem(
    data: CreateBudgetLineItemDto,
    client?: PoolClient,
  ): Promise<BudgetLineItemDto> {
    const baseCost = Math.round(data.quantity * data.unitRateCents);
    const fringeMultiplier = 1 + (data.fringePercentage ?? 0) / 100;
    const estimatedTotal = Math.round(baseCost * fringeMultiplier);
    const lowEstimate = data.lowEstimateCents ?? Math.round(estimatedTotal * 0.9);
    const highEstimate = data.highEstimateCents ?? Math.round(estimatedTotal * 1.15);

    const res = await this.getExecutor(client).query(
      `INSERT INTO budget_line_items (
         film_id, budget_id, rate_card_id, element_id, account_code,
         category, description, quantity, unit, unit_rate_cents,
         fringe_percentage, low_estimate_cents, estimated_total_cents,
         high_estimate_cents, actual_cost_cents, assumptions, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, $15, $16)
       RETURNING *`,
      [
        data.filmId,
        data.budgetId,
        data.rateCardId ?? null,
        data.elementId ?? null,
        data.accountCode,
        data.category,
        data.description,
        data.quantity,
        data.unit ?? 'days',
        data.unitRateCents,
        data.fringePercentage ?? 0,
        lowEstimate,
        estimatedTotal,
        highEstimate,
        data.assumptions ?? null,
        data.sortOrder ?? 0,
      ],
    );
    return this.mapLineItemRow(res.rows[0]);
  }

  // 8. List line items for a budget
  async listLineItems(
    budgetId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<BudgetLineItemDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT li.* FROM budget_line_items li
       WHERE li.budget_id = $1 AND li.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = li.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY li.sort_order ASC, li.account_code ASC`,
      [budgetId, filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapLineItemRow(row));
  }

  // 9. Update actual cost
  async updateLineItemActual(
    itemId: string,
    filmId: string,
    actualCostCents: number,
    client?: PoolClient,
  ): Promise<BudgetLineItemDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE budget_line_items
       SET actual_cost_cents = $1,
           updated_at = now()
       WHERE id = $2 AND film_id = $3
       RETURNING *`,
      [actualCostCents, itemId, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Line item ${itemId} not found or access denied`);
    }
    return this.mapLineItemRow(res.rows[0]);
  }

  // 10. Generate Top Sheet Summary
  async getTopSheet(
    budgetId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<BudgetTopSheetDto | null> {
    const budget = await this.getBudget(budgetId, filmId, client);
    if (!budget) return null;

    const items = await this.listLineItems(budgetId, filmId, client);

    const categories: ProductionBudgetCategory[] = [
      'above_the_line',
      'below_the_line_production',
      'below_the_line_post',
      'other_production',
    ];

    const categoryLabels: Record<ProductionBudgetCategory, string> = {
      above_the_line: 'Above The Line (Story, Cast, Director, Producer)',
      below_the_line_production: 'Below The Line (Production, Crew, Locations, Art)',
      below_the_line_post: 'Below The Line (Post-Production, VFX, Sound, Music)',
      other_production: 'Other / Overheads (Insurance, Legal, Publicity)',
    };

    const categorySummaries: TopSheetCategorySummaryDto[] = categories.map((cat) => {
      const catItems = items.filter((i) => i.category === cat);
      const budgetedSubtotal = catItems.reduce((acc, i) => acc + i.estimatedTotalCents, 0);
      const actualSubtotal = catItems.reduce((acc, i) => acc + i.actualCostCents, 0);
      return {
        category: cat,
        label: categoryLabels[cat],
        lineItemCount: catItems.length,
        budgetedSubtotalCents: budgetedSubtotal,
        actualSubtotalCents: actualSubtotal,
        varianceCents: budgetedSubtotal - actualSubtotal,
      };
    });

    const subtotal = categorySummaries.reduce((acc, c) => acc + c.budgetedSubtotalCents, 0);
    const contingency = Math.round(subtotal * (budget.contingencyPercentage / 100));
    const taxableTotal = subtotal + contingency;
    const tax = Math.round(taxableTotal * (budget.taxPercentage / 100));
    const grandTotal = taxableTotal + tax;

    return {
      budget,
      categories: categorySummaries,
      subtotalCents: subtotal,
      contingencyCents: contingency,
      taxCents: tax,
      grandTotalCents: grandTotal,
      currency: budget.currency,
    };
  }

  // 11. Generate Cost Report Snapshot
  async generateCostReport(
    budgetId: string,
    filmId: string,
    reportType: CostReportType,
    title: string,
    createdBy: string,
    client?: PoolClient,
  ): Promise<ProductionCostReportDto> {
    const topSheet = await this.getTopSheet(budgetId, filmId, client);
    if (!topSheet) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const payload = {
      categories: topSheet.categories,
      currency: topSheet.currency,
      generatedAt: new Date().toISOString(),
      formulaRules: {
        contingencyPercentage: topSheet.budget.contingencyPercentage,
        taxPercentage: topSheet.budget.taxPercentage,
      },
    };

    const res = await this.getExecutor(client).query(
      `INSERT INTO production_cost_reports (
         film_id, budget_id, report_type, title,
         subtotal_cents, contingency_cents, tax_cents, grand_total_cents,
         report_payload, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        filmId,
        budgetId,
        reportType,
        title,
        topSheet.subtotalCents,
        topSheet.contingencyCents,
        topSheet.taxCents,
        topSheet.grandTotalCents,
        JSON.stringify(payload),
        createdBy,
      ],
    );
    return this.mapCostReportRow(res.rows[0]);
  }

  // 12. Generate CSV Export
  async generateCsvExport(
    budgetId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<string> {
    const topSheet = await this.getTopSheet(budgetId, filmId, client);
    if (!topSheet) {
      throw new Error(`Budget ${budgetId} not found`);
    }
    const items = await this.listLineItems(budgetId, filmId, client);

    const rows: string[] = [];
    rows.push('Account Code,Category,Description,Quantity,Unit,Unit Rate (₹),Fringe %,Budgeted Total (₹),Actual (₹),Variance (₹),Assumptions');

    for (const item of items) {
      const unitRate = (item.unitRateCents / 100).toFixed(2);
      const budgeted = (item.estimatedTotalCents / 100).toFixed(2);
      const actual = (item.actualCostCents / 100).toFixed(2);
      const variance = ((item.estimatedTotalCents - item.actualCostCents) / 100).toFixed(2);
      const desc = `"${item.description.replace(/"/g, '""')}"`;
      const assumptions = `"${(item.assumptions ?? '').replace(/"/g, '""')}"`;

      rows.push(
        `${item.accountCode},${item.category},${desc},${item.quantity},${item.unit},${unitRate},${item.fringePercentage},${budgeted},${actual},${variance},${assumptions}`
      );
    }

    rows.push('');
    rows.push(`SUBTOTAL,,,,,,,${(topSheet.subtotalCents / 100).toFixed(2)},,,`);
    rows.push(`CONTINGENCY (${topSheet.budget.contingencyPercentage}%),,,,,,,${(topSheet.contingencyCents / 100).toFixed(2)},,,`);
    rows.push(`TAX/GST (${topSheet.budget.taxPercentage}%),,,,,,,${(topSheet.taxCents / 100).toFixed(2)},,,`);
    rows.push(`GRAND TOTAL (INR ₹),,,,,,,${(topSheet.grandTotalCents / 100).toFixed(2)},,,`);

    return rows.join('\n');
  }

  // ── Row Mappers ──

  private mapBudgetRow(row: Record<string, unknown>): ProductionBudgetDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      scheduleId: row.schedule_id ? String(row.schedule_id) : null,
      title: String(row.title),
      versionNumber: Number(row.version_number),
      currency: String(row.currency),
      contingencyPercentage: Number(row.contingency_percentage),
      taxPercentage: Number(row.tax_percentage),
      status: String(row.status) as ProductionBudgetDto['status'],
      notes: row.notes ? String(row.notes) : null,
      approvedBy: row.approved_by ? String(row.approved_by) : null,
      approvedAt: row.approved_at ? new Date(row.approved_at as string).toISOString() : null,
      createdBy: String(row.created_by),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapRateCardRow(row: Record<string, unknown>): ProductionRateCardDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      name: String(row.name),
      category: String(row.category) as ProductionRateCardDto['category'],
      rateUnit: String(row.rate_unit) as ProductionRateCardDto['rateUnit'],
      standardRateCents: Number(row.standard_rate_cents),
      overtimeRateCents: row.overtime_rate_cents !== null && row.overtime_rate_cents !== undefined
        ? Number(row.overtime_rate_cents)
        : null,
      currency: String(row.currency),
      notes: row.notes ? String(row.notes) : null,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapLineItemRow(row: Record<string, unknown>): BudgetLineItemDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      budgetId: String(row.budget_id),
      rateCardId: row.rate_card_id ? String(row.rate_card_id) : null,
      elementId: row.element_id ? String(row.element_id) : null,
      accountCode: String(row.account_code),
      category: String(row.category) as BudgetLineItemDto['category'],
      description: String(row.description),
      quantity: Number(row.quantity),
      unit: String(row.unit),
      unitRateCents: Number(row.unit_rate_cents),
      fringePercentage: Number(row.fringe_percentage),
      lowEstimateCents: Number(row.low_estimate_cents),
      estimatedTotalCents: Number(row.estimated_total_cents),
      highEstimateCents: Number(row.high_estimate_cents),
      actualCostCents: Number(row.actual_cost_cents),
      assumptions: row.assumptions ? String(row.assumptions) : null,
      sortOrder: Number(row.sort_order),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapCostReportRow(row: Record<string, unknown>): ProductionCostReportDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      budgetId: String(row.budget_id),
      reportType: String(row.report_type) as ProductionCostReportDto['reportType'],
      title: String(row.title),
      subtotalCents: Number(row.subtotal_cents),
      contingencyCents: Number(row.contingency_cents),
      taxCents: Number(row.tax_cents),
      grandTotalCents: Number(row.grand_total_cents),
      reportPayload: (typeof row.report_payload === 'string'
        ? JSON.parse(row.report_payload)
        : row.report_payload) as Record<string, unknown>,
      createdBy: String(row.created_by),
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }
}
