import type { Pool, PoolClient } from 'pg';
import type {
  AiContentManifestDto,
  CreateAiContentManifestDto,
  AiProposalDto,
  CreateAiProposalDto,
  DecideAiProposalDto,
  AiManifestSummaryDto,
} from '@film-studio/contracts';

export class PostgresAiProposalRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a content manifest (snapshot of what user sees before AI runs)
  async createManifest(
    data: CreateAiContentManifestDto,
    actorUserId: string,
    client?: PoolClient,
  ): Promise<AiContentManifestDto> {
    const res = await this.getExecutor(client).query(
      `INSERT INTO ai_content_manifests (
         film_id, document_id, config_id, created_by,
         document_version, selected_scene_ids, selected_character_ids,
         context_summary_hash, operation_kind, language, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'consent_pending')
       RETURNING *`,
      [
        data.filmId,
        data.documentId,
        data.configId,
        actorUserId,
        data.documentVersion,
        data.selectedSceneIds ?? [],
        data.selectedCharacterIds ?? [],
        data.contextSummaryHash,
        data.operationKind,
        data.language ?? 'te-IN',
      ],
    );
    return this.mapManifestRow(res.rows[0]);
  }

  // 2. Grant explicit consent (user confirms they want AI to process this content)
  async grantConsent(
    manifestId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<AiContentManifestDto> {
    const res = await this.getExecutor(client).query(
      `UPDATE ai_content_manifests
       SET consent_granted = true,
           consent_granted_at = now(),
           status = 'consented',
           updated_at = now()
       WHERE id = $1 AND film_id = $2
       RETURNING *`,
      [manifestId, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Manifest ${manifestId} not found or access denied`);
    }
    return this.mapManifestRow(res.rows[0]);
  }

  // 3. List manifests for a film
  async listManifests(
    filmId: string,
    client?: PoolClient,
  ): Promise<AiContentManifestDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT m.* FROM ai_content_manifests m
       WHERE m.film_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = m.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY m.created_at DESC`,
      [filmId],
    );
    return res.rows.map((row: Record<string, unknown>) =>
      this.mapManifestRow(row),
    );
  }

  // 4. Create a proposal (AI-generated output attached to a manifest)
  async createProposal(
    data: CreateAiProposalDto,
    client?: PoolClient,
  ): Promise<AiProposalDto> {
    // Auto-assign next proposal_index within the manifest
    const indexRes = await this.getExecutor(client).query(
      `SELECT COALESCE(MAX(proposal_index), 0) + 1 AS next_idx
       FROM ai_proposals WHERE manifest_id = $1`,
      [data.manifestId],
    );
    const nextIndex = Number(indexRes.rows[0].next_idx);

    const res = await this.getExecutor(client).query(
      `INSERT INTO ai_proposals (
         film_id, manifest_id, proposal_index, content_type,
         original_text, proposed_text, target_scene_id, target_character_id,
         rationale, confidence_score, prompt_tokens, completion_tokens
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.filmId,
        data.manifestId,
        nextIndex,
        data.contentType,
        data.originalText,
        data.proposedText,
        data.targetSceneId ?? null,
        data.targetCharacterId ?? null,
        data.rationale ?? null,
        data.confidenceScore ?? null,
        data.promptTokens ?? 0,
        data.completionTokens ?? 0,
      ],
    );
    return this.mapProposalRow(res.rows[0]);
  }

  // 5. List proposals for a manifest
  async listProposals(
    manifestId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<AiProposalDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT p.* FROM ai_proposals p
       WHERE p.manifest_id = $1 AND p.film_id = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = p.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY p.proposal_index ASC`,
      [manifestId, filmId],
    );
    return res.rows.map((row: Record<string, unknown>) =>
      this.mapProposalRow(row),
    );
  }

  // 6. Decide on a proposal (accept / reject / edit)
  async decideProposal(
    proposalId: string,
    filmId: string,
    actorUserId: string,
    decision: DecideAiProposalDto,
    client?: PoolClient,
  ): Promise<AiProposalDto> {
    if (decision.decision === 'edited' && !decision.editedText) {
      throw new Error("'edited' decision requires editedText");
    }
    const res = await this.getExecutor(client).query(
      `UPDATE ai_proposals
       SET decision = $1,
           edited_text = $2,
           decided_by = $3,
           decided_at = now(),
           updated_at = now()
       WHERE id = $4 AND film_id = $5
       RETURNING *`,
      [
        decision.decision,
        decision.editedText ?? null,
        actorUserId,
        proposalId,
        filmId,
      ],
    );
    if (res.rows.length === 0) {
      throw new Error(`Proposal ${proposalId} not found or access denied`);
    }
    return this.mapProposalRow(res.rows[0]);
  }

  // 7. Summary of a manifest (decision counts)
  async getManifestSummary(
    manifestId: string,
    filmId: string,
    client?: PoolClient,
  ): Promise<AiManifestSummaryDto> {
    const res = await this.getExecutor(client).query(
      `SELECT
         m.id,
         m.operation_kind,
         m.status,
         m.consent_granted,
         COUNT(p.id)::int AS total_proposals,
         COUNT(p.id) FILTER (WHERE p.decision = 'accepted')::int AS accepted_count,
         COUNT(p.id) FILTER (WHERE p.decision = 'rejected')::int AS rejected_count,
         COUNT(p.id) FILTER (WHERE p.decision = 'edited')::int AS edited_count,
         COUNT(p.id) FILTER (WHERE p.decision = 'pending')::int AS pending_count
       FROM ai_content_manifests m
       LEFT JOIN ai_proposals p ON p.manifest_id = m.id
       WHERE m.id = $1 AND m.film_id = $2
       GROUP BY m.id, m.operation_kind, m.status, m.consent_granted`,
      [manifestId, filmId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Manifest ${manifestId} not found`);
    }
    const row = res.rows[0];
    return {
      id: String(row.id),
      operationKind: String(row.operation_kind) as AiManifestSummaryDto['operationKind'],
      status: String(row.status) as AiManifestSummaryDto['status'],
      consentGranted: Boolean(row.consent_granted),
      totalProposals: Number(row.total_proposals),
      acceptedCount: Number(row.accepted_count),
      rejectedCount: Number(row.rejected_count),
      editedCount: Number(row.edited_count),
      pendingCount: Number(row.pending_count),
    };
  }

  // ── Row Mappers ──

  private mapManifestRow(row: Record<string, unknown>): AiContentManifestDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      documentId: String(row.document_id),
      configId: String(row.config_id),
      createdBy: String(row.created_by),
      documentVersion: Number(row.document_version),
      selectedSceneIds: (row.selected_scene_ids as string[]) ?? [],
      selectedCharacterIds: (row.selected_character_ids as string[]) ?? [],
      contextSummaryHash: String(row.context_summary_hash),
      operationKind: String(row.operation_kind) as AiContentManifestDto['operationKind'],
      language: String(row.language),
      consentGranted: Boolean(row.consent_granted),
      consentGrantedAt: row.consent_granted_at
        ? new Date(row.consent_granted_at as string).toISOString()
        : null,
      status: String(row.status) as AiContentManifestDto['status'],
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  private mapProposalRow(row: Record<string, unknown>): AiProposalDto {
    return {
      id: String(row.id),
      filmId: String(row.film_id),
      manifestId: String(row.manifest_id),
      proposalIndex: Number(row.proposal_index),
      contentType: String(row.content_type) as AiProposalDto['contentType'],
      originalText: String(row.original_text),
      proposedText: String(row.proposed_text),
      targetSceneId: row.target_scene_id ? String(row.target_scene_id) : null,
      targetCharacterId: row.target_character_id
        ? String(row.target_character_id)
        : null,
      rationale: row.rationale ? String(row.rationale) : null,
      confidenceScore: row.confidence_score !== null && row.confidence_score !== undefined
        ? Number(row.confidence_score)
        : null,
      decision: String(row.decision) as AiProposalDto['decision'],
      editedText: row.edited_text ? String(row.edited_text) : null,
      decidedBy: row.decided_by ? String(row.decided_by) : null,
      decidedAt: row.decided_at
        ? new Date(row.decided_at as string).toISOString()
        : null,
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }
}
