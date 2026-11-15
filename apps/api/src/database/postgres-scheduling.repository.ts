import type { Pool, PoolClient } from 'pg';
import type {
  ShootingScheduleDto,
  CreateShootingScheduleDto,
  ScheduleShootDayDto,
  CreateScheduleShootDayDto,
  ScheduleStripDto,
  CreateScheduleStripDto,
  ScheduleConstraintDto,
  CreateScheduleConstraintDto,
  ScheduleConflictDto,
  CreateScheduleConflictDto,
  ShootingScheduleFullBoardDto,
} from '@film-studio/contracts';

export class PostgresSchedulingRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a shooting schedule (auto-allocating version number)
  async createSchedule(
    data: CreateShootingScheduleDto,
    createdBy: string,
    client?: PoolClient,
  ): Promise<ShootingScheduleDto> {
    const versionRes = await this.getExecutor(client).query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM shooting_schedules WHERE film_id = $1`,
      [data.filmId],
    );
    const nextVer = Number(versionRes.rows[0].next_ver);

    const res = await this.getExecutor(client).query(
      `INSERT INTO shooting_schedules (
         film_id, title, version_number, status, start_date, end_date,
         estimated_shoot_days, notes, created_by
       ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.filmId,
        data.title,
        nextVer,
        data.startDate,
        data.endDate ?? null,
        data.estimatedShootDays ?? 1,
        data.notes ?? null,
        createdBy,
      ],
    );
    return this.mapScheduleRow(res.rows[0]);
  }

  // 2. Get schedule by ID
  async getSchedule(
    id: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ShootingScheduleDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT s.* FROM shooting_schedules s
       WHERE s.id = $1 AND s.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = s.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [id, filmId],
    );
    if (res.rows.length === 0) return null;
    return this.mapScheduleRow(res.rows[0]);
  }

  // 3. List schedules for a film
  async listSchedules(
    filmId: string,
    client?: PoolClient,
  ): Promise<ShootingScheduleDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT s.* FROM shooting_schedules s
       WHERE s.film_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = s.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY s.version_number DESC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapScheduleRow(row));
  }

  // 4. Approve schedule
  async approveSchedule(
    id: string,
    filmId: string,
    approvedBy: string,
    client?: PoolClient,
  ): Promise<ShootingScheduleDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE shooting_schedules
       SET status = 'approved',
           approved_by = $1,
           approved_at = now(),
           updated_at = now()
       WHERE id = $2 AND film_id = $3
       RETURNING *`,
      [approvedBy, id, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Schedule ${id} not found or access denied`);
    }
    return this.mapScheduleRow(res.rows[0]);
  }

  // 5. Create shoot day
  async createShootDay(
    data: CreateScheduleShootDayDto,
    client?: PoolClient,
  ): Promise<ScheduleShootDayDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO schedule_shoot_days (
         film_id, schedule_id, day_number, calendar_date,
         title, call_time, wrap_time, primary_location, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.filmId,
        data.scheduleId,
        data.dayNumber,
        data.calendarDate,
        data.title ?? null,
        data.callTime ?? null,
        data.wrapTime ?? null,
        data.primaryLocation ?? null,
        data.notes ?? null,
      ],
    );
    return this.mapShootDayRow(res.rows[0]);
  }

  // 6. List shoot days for a schedule
  async listShootDays(
    scheduleId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ScheduleShootDayDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT d.* FROM schedule_shoot_days d
       WHERE d.schedule_id = $1 AND d.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = d.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY d.day_number ASC`,
      [scheduleId, filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapShootDayRow(row));
  }

  // 7. Create stripboard strip
  async createStrip(
    data: CreateScheduleStripDto,
    client?: PoolClient,
  ): Promise<ScheduleStripDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO schedule_strips (
         film_id, schedule_id, strip_type, scene_id, shoot_day_id,
         strip_order, page_eighths, estimated_minutes, int_ext, day_night,
         location_text, description, cast_ids
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.filmId,
        data.scheduleId,
        data.stripType,
        data.sceneId ?? null,
        data.shootDayId ?? null,
        data.stripOrder,
        data.pageEighths ?? null,
        data.estimatedMinutes ?? 60,
        data.intExt ?? null,
        data.dayNight ?? null,
        data.locationText ?? null,
        data.description ?? null,
        data.castIds ?? [],
      ],
    );
    return this.mapStripRow(res.rows[0]);
  }

  // 8. List strips on a board
  async listStrips(
    scheduleId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ScheduleStripDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT s.* FROM schedule_strips s
       WHERE s.schedule_id = $1 AND s.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = s.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY s.strip_order ASC`,
      [scheduleId, filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapStripRow(row));
  }

  // 9. Reorder strips (two-pass to avoid transient unique constraint collisions)
  async reorderStrips(
    scheduleId: string,
    filmId: string,
    stripOrders: { stripId: string; newOrder: number }[],
    client?: PoolClient,
  ): Promise<void> {
    // Pass 1: move to high temporary positive offset
    for (let i = 0; i < stripOrders.length; i++) {
      const item = stripOrders[i];
      if (!item) continue;
      await this.getExecutor(client).query(
        `UPDATE schedule_strips
         SET strip_order = $1, updated_at = now()
         WHERE id = $2 AND schedule_id = $3 AND film_id = $4`,
        [100000 + i, item.stripId, scheduleId, filmId],
      );
    }
    // Pass 2: assign final target order
    for (const item of stripOrders) {
      await this.getExecutor(client).query(
        `UPDATE schedule_strips
         SET strip_order = $1, updated_at = now()
         WHERE id = $2 AND schedule_id = $3 AND film_id = $4`,
        [item.newOrder, item.stripId, scheduleId, filmId],
      );
    }
  }

  // 10. Create availability / production constraint
  async createConstraint(
    data: CreateScheduleConstraintDto,
    client?: PoolClient,
  ): Promise<ScheduleConstraintDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO schedule_constraints (
         film_id, constraint_type, entity_id, name,
         start_date, end_date, severity, explanation, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.filmId,
        data.constraintType,
        data.entityId ?? null,
        data.name,
        data.startDate,
        data.endDate,
        data.severity ?? 'hard',
        data.explanation,
        data.isActive ?? true,
      ],
    );
    return this.mapConstraintRow(res.rows[0]);
  }

  // 11. List constraints for a film
  async listConstraints(
    filmId: string,
    client?: PoolClient,
  ): Promise<ScheduleConstraintDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT c.* FROM schedule_constraints c
       WHERE c.film_id = $1 AND c.is_active = true
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = c.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY c.start_date ASC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapConstraintRow(row));
  }

  // 12. Record conflict
  async recordConflict(
    data: CreateScheduleConflictDto,
    client?: PoolClient,
  ): Promise<ScheduleConflictDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO schedule_conflicts (
         film_id, schedule_id, strip_id, constraint_id,
         conflict_type, description, severity, proposed_resolution
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.filmId,
        data.scheduleId,
        data.stripId ?? null,
        data.constraintId ?? null,
        data.conflictType,
        data.description,
        data.severity,
        data.proposedResolution ?? null,
      ],
    );
    return this.mapConflictRow(res.rows[0]);
  }

  // 13. Override conflict
  async overrideConflict(
    conflictId: string,
    filmId: string,
    actorUserId: string,
    reason: string,
    client?: PoolClient,
  ): Promise<ScheduleConflictDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE schedule_conflicts
       SET is_overridden = true,
           override_reason = $1,
           overridden_by = $2,
           overridden_at = now()
       WHERE id = $3 AND film_id = $4
       RETURNING *`,
      [reason, actorUserId, conflictId, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Conflict ${conflictId} not found or access denied`);
    }
    return this.mapConflictRow(res.rows[0]);
  }

  // 14. List conflicts
  async listConflicts(
    scheduleId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ScheduleConflictDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT c.* FROM schedule_conflicts c
       WHERE c.schedule_id = $1 AND c.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = c.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY c.created_at ASC`,
      [scheduleId, filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapConflictRow(row));
  }

  // 15. Get Full Stripboard
  async getFullBoard(
    scheduleId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<ShootingScheduleFullBoardDto | null> {
    const schedule = await this.getSchedule(scheduleId, filmId, client);
    if (!schedule) return null;

    const days = await this.listShootDays(scheduleId, filmId, client);
    const strips = await this.listStrips(scheduleId, filmId, client);
    const conflicts = await this.listConflicts(scheduleId, filmId, client);

    return {
      schedule,
      days,
      strips,
      conflicts,
    };
  }

  // ── Row Mappers ──

  private formatDate(date: unknown): string {
    if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const str = String(date);
    const idx = str.indexOf('T');
    return idx === -1 ? str : str.slice(0, idx);
  }

  private mapScheduleRow(row: Record<string, unknown>): ShootingScheduleDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      title: String(row.title),
      versionNumber: Number(row.version_number),
      status: String(row.status) as ShootingScheduleDto['status'],
      startDate: this.formatDate(row.start_date),
      endDate: row.end_date ? this.formatDate(row.end_date) : null,
      estimatedShootDays: Number(row.estimated_shoot_days),
      notes: row.notes ? String(row.notes) : null,
      approvedBy: row.approved_by ? String(row.approved_by) : null,
      approvedAt: row.approved_at ? new Date(row.approved_at as string).toISOString() : null,
      createdBy: String(row.created_by),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapShootDayRow(row: Record<string, unknown>): ScheduleShootDayDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      scheduleId: String(row.schedule_id),
      dayNumber: Number(row.day_number),
      calendarDate: this.formatDate(row.calendar_date),
      title: row.title ? String(row.title) : null,
      callTime: row.call_time ? String(row.call_time) : null,
      wrapTime: row.wrap_time ? String(row.wrap_time) : null,
      primaryLocation: row.primary_location ? String(row.primary_location) : null,
      notes: row.notes ? String(row.notes) : null,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapStripRow(row: Record<string, unknown>): ScheduleStripDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      scheduleId: String(row.schedule_id),
      stripType: String(row.strip_type) as ScheduleStripDto['stripType'],
      sceneId: row.scene_id ? String(row.scene_id) : null,
      shootDayId: row.shoot_day_id ? String(row.shoot_day_id) : null,
      stripOrder: Number(row.strip_order),
      pageEighths: row.page_eighths ? Number(row.page_eighths) : null,
      estimatedMinutes: Number(row.estimated_minutes),
      intExt: row.int_ext ? (String(row.int_ext) as ScheduleStripDto['intExt']) : null,
      dayNight: row.day_night ? (String(row.day_night) as ScheduleStripDto['dayNight']) : null,
      locationText: row.location_text ? String(row.location_text) : null,
      description: row.description ? String(row.description) : null,
      castIds: (row.cast_ids as string[]) ?? [],
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapConstraintRow(row: Record<string, unknown>): ScheduleConstraintDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      constraintType: String(row.constraint_type) as ScheduleConstraintDto['constraintType'],
      entityId: row.entity_id ? String(row.entity_id) : null,
      name: String(row.name),
      startDate: this.formatDate(row.start_date),
      endDate: this.formatDate(row.end_date),
      severity: String(row.severity) as ScheduleConstraintDto['severity'],
      explanation: String(row.explanation),
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapConflictRow(row: Record<string, unknown>): ScheduleConflictDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      scheduleId: String(row.schedule_id),
      stripId: row.strip_id ? String(row.strip_id) : null,
      constraintId: row.constraint_id ? String(row.constraint_id) : null,
      conflictType: String(row.conflict_type) as ScheduleConflictDto['conflictType'],
      description: String(row.description),
      severity: String(row.severity) as ScheduleConflictDto['severity'],
      proposedResolution: row.proposed_resolution ? String(row.proposed_resolution) : null,
      isOverridden: Boolean(row.is_overridden),
      overrideReason: row.override_reason ? String(row.override_reason) : null,
      overriddenBy: row.overridden_by ? String(row.overridden_by) : null,
      overriddenAt: row.overridden_at ? new Date(row.overridden_at as string).toISOString() : null,
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }
}
