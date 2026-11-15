import type { Pool, PoolClient } from 'pg';
import type {
  FilmApprovalPolicyDto,
  FilmApprovalRequestDto,
  FilmApprovalDecisionDto,
  FilmApprovalRequestWithDecisionsDto,
  FilmOwnershipTransferDto,
  AdminBreakGlassSessionDto,
  FilmRetentionPolicyDto,
  FilmLifecycleRequestDto,
  CreateFilmApprovalPolicyInput,
  CreateFilmApprovalRequestInput,
  RecordFilmApprovalDecisionInput,
  InitiateFilmOwnershipTransferInput,
  CreateAdminBreakGlassInput,
  UpsertFilmRetentionPolicyInput,
  CreateFilmLifecycleRequestInput,
  FilmApprovalPolicyType,
  FilmApprovalStatus,
  FilmApprovalDecisionValue,
  FilmOwnershipTransferStatus,
  AdminBreakGlassStatus,
  FilmLifecycleRequestType,
  FilmLifecycleRequestStatus,
} from '@film-studio/contracts';

interface PolicyRow {
  id: string;
  film_id: string;
  policy_type: FilmApprovalPolicyType;
  name: string;
  description: string | null;
  required_role_keys: string[];
  min_approvals: number;
  is_sequential: boolean;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RequestRow {
  id: string;
  film_id: string;
  policy_id: string;
  target_type: 'document' | 'schedule' | 'budget' | 'character' | 'cut' | 'other';
  target_id: string;
  title: string;
  summary: string | null;
  status: FilmApprovalStatus;
  requested_by: string;
  decided_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DecisionRow {
  id: string;
  request_id: string;
  film_id: string;
  approver_user_id: string;
  decision: FilmApprovalDecisionValue;
  feedback: string | null;
  signature: string | null;
  created_at: Date | string;
}

interface TransferRow {
  id: string;
  film_id: string;
  current_owner_user_id: string;
  target_owner_user_id: string;
  initiated_by: string;
  status: FilmOwnershipTransferStatus;
  reason: string;
  expires_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
}

interface BreakGlassRow {
  id: string;
  admin_user_id: string;
  target_film_id: string;
  reason: string;
  ticket_reference: string;
  status: AdminBreakGlassStatus;
  expires_at: Date | string;
  closed_at: Date | string | null;
  created_at: Date | string;
}

interface RetentionRow {
  id: string;
  film_id: string;
  retention_period_days: number;
  auto_purge_deleted_items: boolean;
  purge_delay_days: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface LifecycleRow {
  id: string;
  film_id: string;
  requested_by: string;
  request_type: FilmLifecycleRequestType;
  status: FilmLifecycleRequestStatus;
  export_manifest: Record<string, unknown> | null;
  completed_at: Date | string | null;
  created_at: Date | string;
}

function toIso(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
}

function mapPolicy(row: PolicyRow): FilmApprovalPolicyDto {
  return {
    id: row.id,
    filmId: row.film_id,
    policyType: row.policy_type,
    name: row.name,
    description: row.description ?? null,
    requiredRoleKeys: row.required_role_keys ?? [],
    minApprovals: Number(row.min_approvals),
    isSequential: Boolean(row.is_sequential),
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapRequest(row: RequestRow): FilmApprovalRequestDto {
  return {
    id: row.id,
    filmId: row.film_id,
    policyId: row.policy_id,
    targetType: row.target_type,
    targetId: row.target_id,
    title: row.title,
    summary: row.summary ?? null,
    status: row.status,
    requestedBy: row.requested_by,
    decidedAt: toIso(row.decided_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapDecision(row: DecisionRow): FilmApprovalDecisionDto {
  return {
    id: row.id,
    requestId: row.request_id,
    filmId: row.film_id,
    approverUserId: row.approver_user_id,
    decision: row.decision,
    feedback: row.feedback ?? null,
    signature: row.signature ?? null,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapTransfer(row: TransferRow): FilmOwnershipTransferDto {
  return {
    id: row.id,
    filmId: row.film_id,
    currentOwnerUserId: row.current_owner_user_id,
    targetOwnerUserId: row.target_owner_user_id,
    initiatedBy: row.initiated_by,
    status: row.status,
    reason: row.reason,
    expiresAt: toIso(row.expires_at) ?? new Date().toISOString(),
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapBreakGlass(row: BreakGlassRow): AdminBreakGlassSessionDto {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    targetFilmId: row.target_film_id,
    reason: row.reason,
    ticketReference: row.ticket_reference,
    status: row.status,
    expiresAt: toIso(row.expires_at) ?? new Date().toISOString(),
    closedAt: toIso(row.closed_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapRetention(row: RetentionRow): FilmRetentionPolicyDto {
  return {
    id: row.id,
    filmId: row.film_id,
    retentionPeriodDays: Number(row.retention_period_days),
    autoPurgeDeletedItems: Boolean(row.auto_purge_deleted_items),
    purgeDelayDays: Number(row.purge_delay_days),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapLifecycle(row: LifecycleRow): FilmLifecycleRequestDto {
  return {
    id: row.id,
    filmId: row.film_id,
    requestedBy: row.requested_by,
    requestType: row.request_type,
    status: row.status,
    exportManifest: row.export_manifest ?? null,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export class PostgresFilmAdminRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Upsert approval policy for a film
  async upsertApprovalPolicy(
    input: CreateFilmApprovalPolicyInput,
    client?: PoolClient,
  ): Promise<FilmApprovalPolicyDto> {
    const res = await this.getExecutor(client).query<PolicyRow>(
      `INSERT INTO film_approval_policies (
         film_id, policy_type, name, description, required_role_keys, min_approvals, is_sequential, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (film_id, policy_type) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         required_role_keys = EXCLUDED.required_role_keys,
         min_approvals = EXCLUDED.min_approvals,
         is_sequential = EXCLUDED.is_sequential,
         is_active = true,
         updated_at = now()
       RETURNING *`,
      [
        input.filmId,
        input.policyType,
        input.name,
        input.description ?? null,
        input.requiredRoleKeys ?? [],
        input.minApprovals ?? 1,
        input.isSequential ?? false,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to upsert approval policy');
    return mapPolicy(row);
  }

  // 2. Get approval policy
  async getApprovalPolicy(
    filmId: string,
    policyType: FilmApprovalPolicyType,
    client?: PoolClient,
  ): Promise<FilmApprovalPolicyDto | null> {
    const res = await this.getExecutor(client).query<PolicyRow>(
      `SELECT p.*
       FROM film_approval_policies p
       WHERE p.film_id = $1 AND p.policy_type = $2
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = p.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [filmId, policyType],
    );
    const row = res.rows[0];
    return row ? mapPolicy(row) : null;
  }

  // 3. Create approval request
  async createApprovalRequest(
    input: CreateFilmApprovalRequestInput,
    requestedBy: string,
    client?: PoolClient,
  ): Promise<FilmApprovalRequestDto> {
    const res = await this.getExecutor(client).query<RequestRow>(
      `INSERT INTO film_approval_requests (
         film_id, policy_id, target_type, target_id, title, summary, status, requested_by
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [
        input.filmId,
        input.policyId,
        input.targetType,
        input.targetId,
        input.title,
        input.summary ?? null,
        requestedBy,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create approval request');
    return mapRequest(row);
  }

  // 4. Record approval decision and evaluate completion
  async recordApprovalDecision(
    input: RecordFilmApprovalDecisionInput,
    approverUserId: string,
    client?: PoolClient,
  ): Promise<FilmApprovalRequestWithDecisionsDto> {
    // Record decision
    await this.getExecutor(client).query(
      `INSERT INTO film_approval_decisions (
         request_id, film_id, approver_user_id, decision, feedback, signature
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (request_id, approver_user_id) DO UPDATE SET
         decision = EXCLUDED.decision,
         feedback = EXCLUDED.feedback,
         signature = EXCLUDED.signature,
         created_at = now()`,
      [
        input.requestId,
        input.filmId,
        approverUserId,
        input.decision,
        input.feedback ?? null,
        input.signature ?? null,
      ],
    );

    // Fetch policy and decisions to evaluate status
    const reqRes = await this.getExecutor(client).query<RequestRow>(
      `SELECT r.* FROM film_approval_requests r WHERE r.id = $1`,
      [input.requestId],
    );
    const requestRow = reqRes.rows[0];
    if (!requestRow) throw new Error('Approval request not found');

    const policyRes = await this.getExecutor(client).query<PolicyRow>(
      `SELECT p.* FROM film_approval_policies p WHERE p.id = $1`,
      [requestRow.policy_id],
    );
    const policyRow = policyRes.rows[0];

    const decisionsRes = await this.getExecutor(client).query<DecisionRow>(
      `SELECT d.* FROM film_approval_decisions d WHERE d.request_id = $1 ORDER BY d.created_at ASC`,
      [input.requestId],
    );
    const decisions = decisionsRes.rows;

    if (policyRow && requestRow.status === 'pending') {
      const approvedCount = decisions.filter((d) => d.decision === 'approved').length;
      const rejectedCount = decisions.filter((d) => d.decision === 'rejected').length;

      if (rejectedCount > 0) {
        // Any explicit rejection sets status to rejected
        await this.getExecutor(client).query(
          `UPDATE film_approval_requests SET status = 'rejected', decided_at = now(), updated_at = now() WHERE id = $1`,
          [input.requestId],
        );
        requestRow.status = 'rejected';
        requestRow.decided_at = new Date();
      } else if (approvedCount >= policyRow.min_approvals) {
        await this.getExecutor(client).query(
          `UPDATE film_approval_requests SET status = 'approved', decided_at = now(), updated_at = now() WHERE id = $1`,
          [input.requestId],
        );
        requestRow.status = 'approved';
        requestRow.decided_at = new Date();
      }
    }

    return {
      request: mapRequest(requestRow),
      decisions: decisions.map(mapDecision),
    };
  }

  // 5. Get approval request with decisions
  async getApprovalRequest(
    requestId: string,
    client?: PoolClient,
  ): Promise<FilmApprovalRequestWithDecisionsDto | null> {
    const reqRes = await this.getExecutor(client).query<RequestRow>(
      `SELECT r.*
       FROM film_approval_requests r
       WHERE r.id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = r.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [requestId],
    );
    const requestRow = reqRes.rows[0];
    if (!requestRow) return null;

    const decisionsRes = await this.getExecutor(client).query<DecisionRow>(
      `SELECT d.* FROM film_approval_decisions d WHERE d.request_id = $1 ORDER BY d.created_at ASC`,
      [requestId],
    );

    return {
      request: mapRequest(requestRow),
      decisions: decisionsRes.rows.map(mapDecision),
    };
  }

  // 6. Initiate film ownership transfer
  async initiateOwnershipTransfer(
    input: InitiateFilmOwnershipTransferInput,
    currentOwnerUserId: string,
    tokenHash: Buffer,
    client?: PoolClient,
  ): Promise<FilmOwnershipTransferDto> {
    const expiryInterval = `${input.expiryHours || 48} hours`;
    const res = await this.getExecutor(client).query<TransferRow>(
      `INSERT INTO film_ownership_transfers (
         film_id, current_owner_user_id, target_owner_user_id, initiated_by,
         status, reason, token_hash, expires_at
       ) VALUES ($1, $2, $3, $2, 'initiated', $4, $5, now() + $6::interval)
       RETURNING *`,
      [
        input.filmId,
        currentOwnerUserId,
        input.targetOwnerUserId,
        input.reason,
        tokenHash,
        expiryInterval,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to initiate ownership transfer');
    return mapTransfer(row);
  }

  // 7. Accept ownership transfer
  async acceptOwnershipTransfer(
    transferId: string,
    targetUserId: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const res = await this.getExecutor(client).query<TransferRow>(
      `UPDATE film_ownership_transfers
       SET status = 'accepted',
           completed_at = now()
       WHERE id = $1
         AND target_owner_user_id = $2
         AND status = 'initiated'
         AND expires_at > now()
       RETURNING *`,
      [transferId, targetUserId],
    );
    const row = res.rows[0];
    if (!row) return false;

    // Promote target user to admin role in film memberships
    await this.getExecutor(client).query(
      `UPDATE film_memberships
       SET status = 'active'
       WHERE film_id = $1 AND user_id = $2`,
      [row.film_id, targetUserId],
    );
    return true;
  }

  // 8. Super Admin break-glass session
  async startBreakGlassSession(
    input: CreateAdminBreakGlassInput,
    adminUserId: string,
    ipHash?: Buffer,
    client?: PoolClient,
  ): Promise<AdminBreakGlassSessionDto> {
    const durationInterval = `${input.sessionDurationMinutes || 60} minutes`;
    const res = await this.getExecutor(client).query<BreakGlassRow>(
      `INSERT INTO admin_break_glass_sessions (
         admin_user_id, target_film_id, reason, ticket_reference, status, ip_hash, expires_at
       ) VALUES ($1, $2, $3, $4, 'active', $5, now() + $6::interval)
       RETURNING *`,
      [
        adminUserId,
        input.targetFilmId,
        input.reason,
        input.ticketReference,
        ipHash ?? null,
        durationInterval,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create break-glass session');
    return mapBreakGlass(row);
  }

  // 9. Close break-glass session
  async closeBreakGlassSession(
    sessionId: string,
    adminUserId: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const res = await this.getExecutor(client).query(
      `UPDATE admin_break_glass_sessions
       SET status = 'closed',
           closed_at = now()
       WHERE id = $1 AND admin_user_id = $2 AND status = 'active'`,
      [sessionId, adminUserId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // 10. Upsert retention policy
  async upsertRetentionPolicy(
    input: UpsertFilmRetentionPolicyInput,
    client?: PoolClient,
  ): Promise<FilmRetentionPolicyDto> {
    const res = await this.getExecutor(client).query<RetentionRow>(
      `INSERT INTO film_retention_policies (
         film_id, retention_period_days, auto_purge_deleted_items, purge_delay_days
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (film_id) DO UPDATE SET
         retention_period_days = EXCLUDED.retention_period_days,
         auto_purge_deleted_items = EXCLUDED.auto_purge_deleted_items,
         purge_delay_days = EXCLUDED.purge_delay_days,
         updated_at = now()
       RETURNING *`,
      [
        input.filmId,
        input.retentionPeriodDays ?? 365,
        input.autoPurgeDeletedItems ?? true,
        input.purgeDelayDays ?? 30,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to upsert retention policy');
    return mapRetention(row);
  }

  // 11. Create lifecycle request (Export / Soft Archive / Permanent Delete)
  async createLifecycleRequest(
    input: CreateFilmLifecycleRequestInput,
    requestedBy: string,
    client?: PoolClient,
  ): Promise<FilmLifecycleRequestDto> {
    const res = await this.getExecutor(client).query<LifecycleRow>(
      `INSERT INTO film_lifecycle_requests (
         film_id, requested_by, request_type, status, export_manifest
       ) VALUES ($1, $2, $3, 'requested', $4)
       RETURNING *`,
      [
        input.filmId,
        requestedBy,
        input.requestType,
        input.exportManifest ? JSON.stringify(input.exportManifest) : null,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create lifecycle request');
    return mapLifecycle(row);
  }

  // 12. Complete lifecycle request
  async completeLifecycleRequest(
    requestId: string,
    exportManifest?: Record<string, unknown>,
    client?: PoolClient,
  ): Promise<FilmLifecycleRequestDto | null> {
    const res = await this.getExecutor(client).query<LifecycleRow>(
      `UPDATE film_lifecycle_requests
       SET status = 'completed',
           export_manifest = COALESCE($2, export_manifest),
           completed_at = now()
       WHERE id = $1
       RETURNING *`,
      [requestId, exportManifest ? JSON.stringify(exportManifest) : null],
    );
    const row = res.rows[0];
    return row ? mapLifecycle(row) : null;
  }
}
