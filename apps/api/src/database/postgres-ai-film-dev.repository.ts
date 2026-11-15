import type { Pool, PoolClient } from 'pg';
import type {
  AiCoverageReportDto,
  CreateAiCoverageReportDto,
  ReviewAiCoverageReportDto,
  AiPitchPackageDto,
  CreateAiPitchPackageDto,
  ReviewAiPitchPackageDto,
} from '@film-studio/contracts';

export class PostgresAiFilmDevRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a coverage report
  async createCoverageReport(
    data: CreateAiCoverageReportDto,
    client?: PoolClient,
  ): Promise<AiCoverageReportDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO ai_coverage_reports (
         film_id, document_id, manifest_id, analyst_user_id,
         model_provenance, logline, synopsis,
         premise_rating, character_rating, dialogue_rating, pacing_rating, commercial_viability_rating,
         overall_recommendation, strengths, weaknesses, scene_citations,
         harm_eval_status, harm_eval_notes, language
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        data.filmId,
        data.documentId,
        data.manifestId ?? null,
        data.analystUserId ?? null,
        JSON.stringify(data.modelProvenance),
        data.logline,
        data.synopsis,
        data.premiseRating,
        data.characterRating,
        data.dialogueRating,
        data.pacingRating,
        data.commercialViabilityRating,
        data.overallRecommendation,
        data.strengths ?? [],
        data.weaknesses ?? [],
        JSON.stringify(data.sceneCitations ?? []),
        data.harmEvalStatus ?? 'passed',
        data.harmEvalNotes ?? null,
        data.language ?? 'te-IN',
      ],
    );
    return this.mapCoverageRow(res.rows[0]);
  }

  // 2. Get coverage report by ID
  async getCoverageReport(
    id: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<AiCoverageReportDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT r.* FROM ai_coverage_reports r
       WHERE r.id = $1 AND r.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = r.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [id, filmId],
    );
    if (res.rows.length === 0) return null;
    return this.mapCoverageRow(res.rows[0]);
  }

  // 3. List coverage reports for a film
  async listCoverageReports(
    filmId: string,
    client?: PoolClient,
  ): Promise<AiCoverageReportDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT r.* FROM ai_coverage_reports r
       WHERE r.film_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = r.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY r.created_at DESC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapCoverageRow(row));
  }

  // 4. Human review on coverage report
  async reviewCoverageReport(
    id: string,
    filmId: string,
    reviewerUserId: string,
    review: ReviewAiCoverageReportDto,
    client?: PoolClient,
  ): Promise<AiCoverageReportDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE ai_coverage_reports
       SET human_review_status = $1,
           human_review_notes = $2,
           human_reviewer_id = $3,
           updated_at = now()
       WHERE id = $4 AND film_id = $5
       RETURNING *`,
      [
        review.humanReviewStatus,
        review.humanReviewNotes ?? null,
        reviewerUserId,
        id,
        filmId,
      ],
    );
    if (res.rows.length === 0) {
      throw new Error(`Coverage report ${id} not found or access denied`);
    }
    return this.mapCoverageRow(res.rows[0]);
  }

  // 5. Create pitch package
  async createPitchPackage(
    data: CreateAiPitchPackageDto,
    client?: PoolClient,
  ): Promise<AiPitchPackageDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO ai_pitch_packages (
         film_id, title, logline, tone_and_genre, target_audience,
         comparable_films, character_breakdowns, act_summaries,
         visual_palette_notes, budget_tier, model_provenance, citations, language
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.filmId,
        data.title,
        data.logline,
        data.toneAndGenre,
        data.targetAudience,
        data.comparableFilms ?? [],
        JSON.stringify(data.characterBreakdowns ?? []),
        JSON.stringify(data.actSummaries ?? []),
        data.visualPaletteNotes ?? null,
        data.budgetTier,
        JSON.stringify(data.modelProvenance),
        JSON.stringify(data.citations ?? []),
        data.language ?? 'te-IN',
      ],
    );
    return this.mapPitchRow(res.rows[0]);
  }

  // 6. Get pitch package by ID
  async getPitchPackage(
    id: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<AiPitchPackageDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT p.* FROM ai_pitch_packages p
       WHERE p.id = $1 AND p.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = p.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [id, filmId],
    );
    if (res.rows.length === 0) return null;
    return this.mapPitchRow(res.rows[0]);
  }

  // 7. List pitch packages for a film
  async listPitchPackages(
    filmId: string,
    client?: PoolClient,
  ): Promise<AiPitchPackageDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT p.* FROM ai_pitch_packages p
       WHERE p.film_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = p.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY p.created_at DESC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) => this.mapPitchRow(row));
  }

  // 8. Human review on pitch package
  async reviewPitchPackage(
    id: string,
    filmId: string,
    reviewerUserId: string,
    review: ReviewAiPitchPackageDto,
    client?: PoolClient,
  ): Promise<AiPitchPackageDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE ai_pitch_packages
       SET human_review_status = $1,
           reviewed_by = $2,
           updated_at = now()
       WHERE id = $3 AND film_id = $4
       RETURNING *`,
      [review.humanReviewStatus, reviewerUserId, id, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Pitch package ${id} not found or access denied`);
    }
    return this.mapPitchRow(res.rows[0]);
  }

  // ── Row Mappers ──

  private mapCoverageRow(row: Record<string, unknown>): AiCoverageReportDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      documentId: String(row.document_id),
      manifestId: row.manifest_id ? String(row.manifest_id) : null,
      analystUserId: row.analyst_user_id ? String(row.analyst_user_id) : null,
      modelProvenance: (typeof row.model_provenance === 'string'
        ? JSON.parse(row.model_provenance)
        : row.model_provenance) as AiCoverageReportDto['modelProvenance'],
      logline: String(row.logline),
      synopsis: String(row.synopsis),
      premiseRating: Number(row.premise_rating),
      characterRating: Number(row.character_rating),
      dialogueRating: Number(row.dialogue_rating),
      pacingRating: Number(row.pacing_rating),
      commercialViabilityRating: Number(row.commercial_viability_rating),
      overallRecommendation: String(row.overall_recommendation) as AiCoverageReportDto['overallRecommendation'],
      strengths: (row.strengths as string[]) ?? [],
      weaknesses: (row.weaknesses as string[]) ?? [],
      sceneCitations: (typeof row.scene_citations === 'string'
        ? JSON.parse(row.scene_citations)
        : row.scene_citations ?? []) as AiCoverageReportDto['sceneCitations'],
      harmEvalStatus: String(row.harm_eval_status) as AiCoverageReportDto['harmEvalStatus'],
      harmEvalNotes: row.harm_eval_notes ? String(row.harm_eval_notes) : null,
      humanReviewerId: row.human_reviewer_id ? String(row.human_reviewer_id) : null,
      humanReviewStatus: String(row.human_review_status) as AiCoverageReportDto['humanReviewStatus'],
      humanReviewNotes: row.human_review_notes ? String(row.human_review_notes) : null,
      language: String(row.language),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapPitchRow(row: Record<string, unknown>): AiPitchPackageDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      title: String(row.title),
      logline: String(row.logline),
      toneAndGenre: String(row.tone_and_genre),
      targetAudience: String(row.target_audience),
      comparableFilms: (row.comparable_films as string[]) ?? [],
      characterBreakdowns: (typeof row.character_breakdowns === 'string'
        ? JSON.parse(row.character_breakdowns)
        : row.character_breakdowns ?? []) as AiPitchPackageDto['characterBreakdowns'],
      actSummaries: (typeof row.act_summaries === 'string'
        ? JSON.parse(row.act_summaries)
        : row.act_summaries ?? []) as AiPitchPackageDto['actSummaries'],
      visualPaletteNotes: row.visual_palette_notes ? String(row.visual_palette_notes) : null,
      budgetTier: String(row.budget_tier) as AiPitchPackageDto['budgetTier'],
      modelProvenance: (typeof row.model_provenance === 'string'
        ? JSON.parse(row.model_provenance)
        : row.model_provenance) as AiPitchPackageDto['modelProvenance'],
      citations: (typeof row.citations === 'string'
        ? JSON.parse(row.citations)
        : row.citations ?? []) as AiPitchPackageDto['citations'],
      humanReviewStatus: String(row.human_review_status) as AiPitchPackageDto['humanReviewStatus'],
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      language: String(row.language),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }
}
