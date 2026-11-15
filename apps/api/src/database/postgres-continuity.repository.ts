import type { Pool, PoolClient } from 'pg';
import type {
  ContinuityFactDto,
  CreateContinuityFactDto,
  ContinuityIssueDto,
  CreateContinuityIssueDto,
  ResolveContinuityIssueDto,
  ProductionRevisionDto,
  CreateProductionRevisionDto,
  RevisionApprovalDto,
  RevisionApprovalStatus,
} from '@film-studio/contracts';

export class PostgresContinuityRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Continuity Facts
  async createContinuityFact(
    data: CreateContinuityFactDto,
    client?: PoolClient
  ): Promise<ContinuityFactDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO continuity_facts (film_id, entity_type, entity_id, attribute_key, canonical_value, evidence_scene_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, film_id, entity_type, entity_id, attribute_key, canonical_value, evidence_scene_id, notes, created_at, updated_at`,
      [
        data.filmId,
        data.entityType,
        data.entityId ?? null,
        data.attributeKey,
        data.canonicalValue,
        data.evidenceSceneId ?? null,
        data.notes ?? null,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      attributeKey: row.attribute_key,
      canonicalValue: row.canonical_value,
      evidenceSceneId: row.evidence_scene_id,
      notes: row.notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async listContinuityFacts(filmId: string, client?: PoolClient): Promise<ContinuityFactDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, entity_type, entity_id, attribute_key, canonical_value, evidence_scene_id, notes, created_at, updated_at
       FROM continuity_facts
       WHERE film_id = $1
         AND app_security.has_active_film_membership($1)
       ORDER BY entity_type ASC, attribute_key ASC, created_at ASC`,
      [filmId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      attributeKey: row.attribute_key,
      canonicalValue: row.canonical_value,
      evidenceSceneId: row.evidence_scene_id,
      notes: row.notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  // 2. Continuity Issues
  async createContinuityIssue(
    data: CreateContinuityIssueDto,
    client?: PoolClient
  ): Promise<ContinuityIssueDto> {
    const status = data.status ?? 'potential';
    const res = await this.getExecutor(client).query(
      `INSERT INTO continuity_issues (film_id, document_id, fact_id, scene_id, rule_code, severity, status, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, film_id, document_id, fact_id, scene_id, rule_code, severity, status, explanation, resolution_notes, resolved_by, resolved_at, created_at, updated_at`,
      [
        data.filmId,
        data.documentId,
        data.factId ?? null,
        data.sceneId,
        data.ruleCode,
        data.severity,
        status,
        data.explanation,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      factId: row.fact_id,
      sceneId: row.scene_id,
      ruleCode: row.rule_code,
      severity: row.severity,
      status: row.status,
      explanation: row.explanation,
      resolutionNotes: row.resolution_notes,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at?.toISOString(),
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async listContinuityIssues(
    filmId: string,
    documentId: string,
    client?: PoolClient
  ): Promise<ContinuityIssueDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, document_id, fact_id, scene_id, rule_code, severity, status, explanation, resolution_notes, resolved_by, resolved_at, created_at, updated_at
       FROM continuity_issues
       WHERE film_id = $1 AND document_id = $2
         AND app_security.has_active_film_membership($1)
       ORDER BY severity DESC, created_at ASC`,
      [filmId, documentId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      factId: row.fact_id,
      sceneId: row.scene_id,
      ruleCode: row.rule_code,
      severity: row.severity,
      status: row.status,
      explanation: row.explanation,
      resolutionNotes: row.resolution_notes,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at?.toISOString(),
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async resolveContinuityIssue(
    filmId: string,
    issueId: string,
    data: ResolveContinuityIssueDto,
    client?: PoolClient
  ): Promise<ContinuityIssueDto> {
    const now = new Date();
    const res = await this.getExecutor(client).query(
      `UPDATE continuity_issues
       SET status = $1,
           resolution_notes = $2,
           resolved_by = $3,
           resolved_at = $4,
           updated_at = $4
       WHERE film_id = $5 AND id = $6
       RETURNING id, film_id, document_id, fact_id, scene_id, rule_code, severity, status, explanation, resolution_notes, resolved_by, resolved_at, created_at, updated_at`,
      [
        data.status,
        data.resolutionNotes ?? null,
        data.resolvedBy,
        now,
        filmId,
        issueId,
      ]
    );

    if (res.rows.length === 0) {
      throw new Error(`Continuity issue ${issueId} not found in film ${filmId}`);
    }

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      factId: row.fact_id,
      sceneId: row.scene_id,
      ruleCode: row.rule_code,
      severity: row.severity,
      status: row.status,
      explanation: row.explanation,
      resolutionNotes: row.resolution_notes,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at?.toISOString(),
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  // 3. Production Revisions
  async createProductionRevision(
    data: CreateProductionRevisionDto,
    client?: PoolClient
  ): Promise<ProductionRevisionDto> {
    let revNum = data.revisionNumber;
    if (!revNum) {
      const maxRes = await this.getExecutor(client).query(
        `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_rev
         FROM production_revisions
         WHERE film_id = $1 AND document_id = $2`,
        [data.filmId, data.documentId]
      );
      revNum = Number(maxRes.rows[0].next_rev);
    }

    const res = await this.getExecutor(client).query(
      `INSERT INTO production_revisions (film_id, document_id, revision_number, color, title, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, film_id, document_id, revision_number, color, title, is_locked, locked_at, locked_by, created_by, created_at, updated_at`,
      [
        data.filmId,
        data.documentId,
        revNum,
        data.color,
        data.title,
        data.createdBy,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      revisionNumber: row.revision_number,
      color: row.color,
      title: row.title,
      isLocked: row.is_locked,
      lockedAt: row.locked_at?.toISOString(),
      lockedBy: row.locked_by,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async listProductionRevisions(
    filmId: string,
    documentId: string,
    client?: PoolClient
  ): Promise<ProductionRevisionDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, document_id, revision_number, color, title, is_locked, locked_at, locked_by, created_by, created_at, updated_at
       FROM production_revisions
       WHERE film_id = $1 AND document_id = $2
         AND app_security.has_active_film_membership($1)
       ORDER BY revision_number ASC`,
      [filmId, documentId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      revisionNumber: row.revision_number,
      color: row.color,
      title: row.title,
      isLocked: row.is_locked,
      lockedAt: row.locked_at?.toISOString(),
      lockedBy: row.locked_by,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async lockProductionRevision(
    filmId: string,
    revisionId: string,
    lockedBy: string,
    client?: PoolClient
  ): Promise<ProductionRevisionDto> {
    const now = new Date();
    const res = await this.getExecutor(client).query(
      `UPDATE production_revisions
       SET is_locked = true,
           locked_by = $1,
           locked_at = $2,
           updated_at = $2
       WHERE film_id = $3 AND id = $4
       RETURNING id, film_id, document_id, revision_number, color, title, is_locked, locked_at, locked_by, created_by, created_at, updated_at`,
      [lockedBy, now, filmId, revisionId]
    );

    if (res.rows.length === 0) {
      throw new Error(`Production revision ${revisionId} not found in film ${filmId}`);
    }

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      revisionNumber: row.revision_number,
      color: row.color,
      title: row.title,
      isLocked: row.is_locked,
      lockedAt: row.locked_at?.toISOString(),
      lockedBy: row.locked_by,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  // 4. Revision Approvals
  async submitRevisionApproval(
    filmId: string,
    revisionId: string,
    approverId: string,
    status: RevisionApprovalStatus,
    comments?: string,
    client?: PoolClient
  ): Promise<RevisionApprovalDto> {
    const now = new Date();
    const res = await this.getExecutor(client).query(
      `INSERT INTO revision_approvals (film_id, revision_id, approver_id, status, comments, decision_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (film_id, revision_id, approver_id) DO UPDATE SET
         status = EXCLUDED.status,
         comments = EXCLUDED.comments,
         decision_at = EXCLUDED.decision_at
       RETURNING id, film_id, revision_id, approver_id, status, comments, decision_at, created_at`,
      [
        filmId,
        revisionId,
        approverId,
        status,
        comments ?? null,
        now,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      revisionId: row.revision_id,
      approverId: row.approver_id,
      status: row.status,
      comments: row.comments,
      decisionAt: row.decision_at?.toISOString(),
      createdAt: row.created_at?.toISOString(),
    };
  }

  async listRevisionApprovals(
    filmId: string,
    revisionId: string,
    client?: PoolClient
  ): Promise<RevisionApprovalDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, revision_id, approver_id, status, comments, decision_at, created_at
       FROM revision_approvals
       WHERE film_id = $1 AND revision_id = $2
         AND app_security.has_active_film_membership($1)
       ORDER BY created_at ASC`,
      [filmId, revisionId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      revisionId: row.revision_id,
      approverId: row.approver_id,
      status: row.status,
      comments: row.comments,
      decisionAt: row.decision_at?.toISOString(),
      createdAt: row.created_at?.toISOString(),
    }));
  }
}
