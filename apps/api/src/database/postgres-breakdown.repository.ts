import type { Pool, PoolClient } from 'pg';
import type {
  ProductionElementDto,
  CreateProductionElementDto,
  UpdateProductionElementDto,
  ProductionElementCategory,
  SceneBreakdownSheetDto,
  UpsertSceneBreakdownSheetDto,
  SceneBreakdownItemDto,
  AddSceneBreakdownItemDto,
  SceneBreakdownFullSheetDto,
} from '@film-studio/contracts';

export class PostgresBreakdownRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a production element
  async createProductionElement(
    data: CreateProductionElementDto,
    createdBy: string,
    client?: PoolClient,
  ): Promise<ProductionElementDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO production_elements (
         film_id, category, name, element_code, description,
         estimated_cost_cents, is_approved, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.filmId,
        data.category,
        data.name,
        data.elementCode ?? null,
        data.description ?? null,
        data.estimatedCostCents ?? 0,
        data.isApproved ?? false,
        createdBy,
      ],
    );
    return this.mapElementRow(res.rows[0]);
  }

  // 2. Get production element by ID
  async getProductionElement(
    id: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ProductionElementDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT pe.* FROM production_elements pe
       WHERE pe.id = $1 AND pe.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = pe.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [id, filmId],
    );
    if (res.rows.length === 0) return null;
    return this.mapElementRow(res.rows[0]);
  }

  // 3. List production elements for a film (optionally filtered by category)
  async listProductionElements(
    filmId: string,
    category?: ProductionElementCategory,
    client?: PoolClient,
  ): Promise<ProductionElementDto[]> {
    let query = `
      SELECT pe.* FROM production_elements pe
      WHERE pe.film_id = $1
        AND EXISTS (
          SELECT 1 FROM film_memberships fm
          WHERE fm.film_id = pe.film_id
            AND fm.user_id = current_setting('app.user_id', true)::uuid
        )
    `;
    const params: unknown[] = [filmId];

    if (category) {
      query += ` AND pe.category = $2`;
      params.push(category);
    }
    query += ` ORDER BY pe.category ASC, pe.name ASC`;

    const res = await this.getExecutor(client).query(query, params);
    return res.rows.map((row: Record<string, unknown>) => this.mapElementRow(row));
  }

  // 4. Update production element
  async updateProductionElement(
    id: string,
    filmId: string,
    data: UpdateProductionElementDto,
    client?: PoolClient,
  ): Promise<ProductionElementDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE production_elements
       SET element_code = COALESCE($1, element_code),
           description = COALESCE($2, description),
           estimated_cost_cents = COALESCE($3, estimated_cost_cents),
           is_approved = COALESCE($4, is_approved),
           updated_at = now()
       WHERE id = $5 AND film_id = $6
       RETURNING *`,
      [
        data.elementCode ?? null,
        data.description ?? null,
        data.estimatedCostCents !== undefined ? data.estimatedCostCents : null,
        data.isApproved !== undefined ? data.isApproved : null,
        id,
        filmId,
      ],
    );
    if (res.rows.length === 0) {
      throw new Error(`Production element ${id} not found or access denied`);
    }
    return this.mapElementRow(res.rows[0]);
  }

  // 5. Upsert scene breakdown sheet
  async upsertSceneBreakdownSheet(
    data: UpsertSceneBreakdownSheetDto,
    client?: PoolClient,
  ): Promise<SceneBreakdownSheetDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO scene_breakdown_sheets (
         film_id, scene_id, revision_id, page_eighths,
         estimated_shoot_minutes, dramatic_day, script_day,
         synopsis, setup_notes, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (film_id, scene_id) DO UPDATE
       SET revision_id = EXCLUDED.revision_id,
           page_eighths = EXCLUDED.page_eighths,
           estimated_shoot_minutes = EXCLUDED.estimated_shoot_minutes,
           dramatic_day = EXCLUDED.dramatic_day,
           script_day = EXCLUDED.script_day,
           synopsis = EXCLUDED.synopsis,
           setup_notes = EXCLUDED.setup_notes,
           status = EXCLUDED.status,
           updated_at = now()
       RETURNING *`,
      [
        data.filmId,
        data.sceneId,
        data.revisionId ?? null,
        data.pageEighths ?? 8,
        data.estimatedShootMinutes ?? 60,
        data.dramaticDay ?? null,
        data.scriptDay ?? null,
        data.synopsis ?? null,
        data.setupNotes ?? null,
        data.status ?? 'draft',
      ],
    );
    return this.mapSheetRow(res.rows[0]);
  }

  // 6. Get scene breakdown full sheet (with items joined to elements)
  async getSceneBreakdownSheet(
    filmId: string,
    sceneId: string,
    client?: PoolClient,
  ): Promise<SceneBreakdownFullSheetDto | null> {
    const sheetRes = await this.getExecutor(client).query(
      `SELECT s.* FROM scene_breakdown_sheets s
       WHERE s.film_id = $1 AND s.scene_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = s.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [filmId, sceneId],
    );
    if (sheetRes.rows.length === 0) return null;

    const sheet = this.mapSheetRow(sheetRes.rows[0]);

    const itemsRes = await this.getExecutor(client).query(
      `SELECT i.*, pe.name AS element_name, pe.category AS element_category, pe.element_code
       FROM scene_breakdown_items i
       JOIN production_elements pe ON pe.id = i.element_id
       WHERE i.breakdown_sheet_id = $1 AND i.film_id = $2
       ORDER BY pe.category ASC, pe.name ASC`,
      [sheet.id, filmId],
    );

    const items = itemsRes.rows.map((row: Record<string, unknown>) => this.mapItemRow(row));

    return {
      sheet,
      items,
    };
  }

  // 7. Lock breakdown sheet
  async lockSceneBreakdownSheet(
    sheetId: string,
    filmId: string,
    lockedBy: string,
    client?: PoolClient,
  ): Promise<SceneBreakdownSheetDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE scene_breakdown_sheets
       SET status = 'locked',
           locked_by = $1,
           locked_at = now(),
           updated_at = now()
       WHERE id = $2 AND film_id = $3
       RETURNING *`,
      [lockedBy, sheetId, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Breakdown sheet ${sheetId} not found or access denied`);
    }
    return this.mapSheetRow(res.rows[0]);
  }

  // 8. Add item to scene breakdown sheet
  async addBreakdownItem(
    data: AddSceneBreakdownItemDto,
    client?: PoolClient,
  ): Promise<SceneBreakdownItemDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO scene_breakdown_items (
         film_id, breakdown_sheet_id, element_id, quantity,
         is_required, notes, source_origin, evidence_text, user_amended
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.filmId,
        data.breakdownSheetId,
        data.elementId,
        data.quantity ?? 1,
        data.isRequired ?? true,
        data.notes ?? null,
        data.sourceOrigin ?? 'manual',
        data.evidenceText ?? null,
        data.userAmended ?? false,
      ],
    );
    return this.mapItemRow(res.rows[0]);
  }

  // 9. Update breakdown item (guarantees user_amended = true so automated extraction never silently overwrites user edits)
  async updateBreakdownItem(
    itemId: string,
    filmId: string,
    data: { quantity?: number; isRequired?: boolean; notes?: string; userAmended?: boolean },
    client?: PoolClient,
  ): Promise<SceneBreakdownItemDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE scene_breakdown_items
       SET quantity = COALESCE($1, quantity),
           is_required = COALESCE($2, is_required),
           notes = COALESCE($3, notes),
           user_amended = COALESCE($4, true),
           updated_at = now()
       WHERE id = $5 AND film_id = $6
       RETURNING *`,
      [
        data.quantity !== undefined ? data.quantity : null,
        data.isRequired !== undefined ? data.isRequired : null,
        data.notes ?? null,
        data.userAmended !== undefined ? data.userAmended : true,
        itemId,
        filmId,
      ],
    );
    if (res.rows.length === 0) {
      throw new Error(`Breakdown item ${itemId} not found or access denied`);
    }
    return this.mapItemRow(res.rows[0]);
  }

  // 10. Remove breakdown item
  async removeBreakdownItem(
    itemId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<void> {
    const res = await this.getExecutor(client).query(
      `DELETE FROM scene_breakdown_items
       WHERE id = $1 AND film_id = $2`,
      [itemId, filmId],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new Error(`Breakdown item ${itemId} not found or access denied`);
    }
  }

  // 11. List breakdown sheets for a film
  async listBreakdownSheets(
    filmId: string,
    client?: PoolClient,
  ): Promise<SceneBreakdownSheetDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT s.* FROM scene_breakdown_sheets s
       WHERE s.film_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = s.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY s.created_at ASC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapSheetRow(row));
  }

  // ── Row Mappers ──

  private mapElementRow(row: Record<string, unknown>): ProductionElementDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      category: String(row.category) as ProductionElementCategory,
      name: String(row.name),
      elementCode: row.element_code ? String(row.element_code) : null,
      description: row.description ? String(row.description) : null,
      estimatedCostCents: Number(row.estimated_cost_cents),
      isApproved: Boolean(row.is_approved),
      createdBy: String(row.created_by),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapSheetRow(row: Record<string, unknown>): SceneBreakdownSheetDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      sceneId: String(row.scene_id),
      revisionId: row.revision_id ? String(row.revision_id) : null,
      pageEighths: Number(row.page_eighths),
      estimatedShootMinutes: Number(row.estimated_shoot_minutes),
      dramaticDay: row.dramatic_day ? String(row.dramatic_day) : null,
      scriptDay: row.script_day ? String(row.script_day) : null,
      synopsis: row.synopsis ? String(row.synopsis) : null,
      setupNotes: row.setup_notes ? String(row.setup_notes) : null,
      status: String(row.status) as SceneBreakdownSheetDto['status'],
      lockedBy: row.locked_by ? String(row.locked_by) : null,
      lockedAt: row.locked_at ? new Date(row.locked_at as string).toISOString() : null,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapItemRow(row: Record<string, unknown>): SceneBreakdownItemDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      breakdownSheetId: String(row.breakdown_sheet_id),
      elementId: String(row.element_id),
      quantity: Number(row.quantity),
      isRequired: Boolean(row.is_required),
      notes: row.notes ? String(row.notes) : null,
      sourceOrigin: String(row.source_origin) as SceneBreakdownItemDto['sourceOrigin'],
      evidenceText: row.evidence_text ? String(row.evidence_text) : null,
      userAmended: Boolean(row.user_amended),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
      elementName: row.element_name ? String(row.element_name) : undefined,
      elementCategory: row.element_category ? (String(row.element_category) as ProductionElementCategory) : undefined,
      elementCode: row.element_code !== undefined ? (row.element_code ? String(row.element_code) : null) : undefined,
    };
  }
}
