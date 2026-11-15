import type { Pool, PoolClient } from 'pg';
import type {
  OrganizationQuotaDto,
  EnterpriseFeaturePolicyDto,
  QuotaUsageRecordDto,
  EnterpriseLegalConsentDto,
  QuotaCheckResultDto,
  UpsertOrganizationQuotaInput,
  CheckQuotaAllowanceInput,
  RecordQuotaUsageInput,
  UpsertEnterpriseFeaturePolicyInput,
  RecordEnterpriseLegalConsentInput,
  OrganizationQuotaTier,
  DataResidencyRegion,
  QuotaResourceType,
  EnterpriseLegalConsentType,
} from '@film-studio/contracts';

interface QuotaRow {
  id: string;
  organization_id: string;
  tier: OrganizationQuotaTier;
  max_storage_bytes: string | number;
  used_storage_bytes: string | number;
  max_films: number;
  max_members_per_film: number;
  max_monthly_ai_tokens: string | number;
  used_monthly_ai_tokens: string | number;
  max_concurrent_editors: number;
  data_residency_region: DataResidencyRegion;
  enforce_strict_quotas: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface FeaturePolicyRow {
  id: string;
  organization_id: string;
  feature_key: string;
  is_enabled: boolean;
  policy_rules: Record<string, unknown>;
  updated_by: string | null;
  updated_at: Date | string;
}

interface UsageRecordRow {
  id: string;
  organization_id: string;
  film_id: string | null;
  resource_type: QuotaResourceType;
  delta: string | number;
  actor_user_id: string | null;
  reference_id: string | null;
  recorded_at: Date | string;
}

interface LegalConsentRow {
  id: string;
  organization_id: string;
  film_id: string | null;
  consent_type: EnterpriseLegalConsentType;
  version: string;
  consented_by_user_id: string;
  consented_at: Date | string;
  metadata: Record<string, unknown>;
}

function toIso(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
}

function mapQuota(row: QuotaRow): OrganizationQuotaDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    tier: row.tier,
    maxStorageBytes: Number(row.max_storage_bytes),
    usedStorageBytes: Number(row.used_storage_bytes),
    maxFilms: Number(row.max_films),
    maxMembersPerFilm: Number(row.max_members_per_film),
    maxMonthlyAiTokens: Number(row.max_monthly_ai_tokens),
    usedMonthlyAiTokens: Number(row.used_monthly_ai_tokens),
    maxConcurrentEditors: Number(row.max_concurrent_editors),
    dataResidencyRegion: row.data_residency_region,
    enforceStrictQuotas: Boolean(row.enforce_strict_quotas),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapFeaturePolicy(row: FeaturePolicyRow): EnterpriseFeaturePolicyDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    featureKey: row.feature_key,
    isEnabled: Boolean(row.is_enabled),
    policyRules: row.policy_rules ?? {},
    updatedBy: row.updated_by ?? null,
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapUsageRecord(row: UsageRecordRow): QuotaUsageRecordDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    filmId: row.film_id ?? null,
    resourceType: row.resource_type,
    delta: Number(row.delta),
    actorUserId: row.actor_user_id ?? null,
    referenceId: row.reference_id ?? null,
    recordedAt: toIso(row.recorded_at) ?? new Date().toISOString(),
  };
}

function mapLegalConsent(row: LegalConsentRow): EnterpriseLegalConsentDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    filmId: row.film_id ?? null,
    consentType: row.consent_type,
    version: row.version,
    consentedByUserId: row.consented_by_user_id,
    consentedAt: toIso(row.consented_at) ?? new Date().toISOString(),
    metadata: row.metadata ?? {},
  };
}

export class PostgresEnterpriseQuotaRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Upsert organization quota
  async upsertQuota(
    input: UpsertOrganizationQuotaInput,
    client?: PoolClient,
  ): Promise<OrganizationQuotaDto> {
    const res = await this.getExecutor(client).query<QuotaRow>(
      `INSERT INTO organization_quotas (
         organization_id, tier, max_storage_bytes, max_films,
         max_members_per_film, max_monthly_ai_tokens, max_concurrent_editors,
         data_residency_region, enforce_strict_quotas
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id) DO UPDATE SET
         tier = EXCLUDED.tier,
         max_storage_bytes = COALESCE(EXCLUDED.max_storage_bytes, organization_quotas.max_storage_bytes),
         max_films = COALESCE(EXCLUDED.max_films, organization_quotas.max_films),
         max_members_per_film = COALESCE(EXCLUDED.max_members_per_film, organization_quotas.max_members_per_film),
         max_monthly_ai_tokens = COALESCE(EXCLUDED.max_monthly_ai_tokens, organization_quotas.max_monthly_ai_tokens),
         max_concurrent_editors = COALESCE(EXCLUDED.max_concurrent_editors, organization_quotas.max_concurrent_editors),
         data_residency_region = EXCLUDED.data_residency_region,
         enforce_strict_quotas = EXCLUDED.enforce_strict_quotas,
         updated_at = now()
       RETURNING *`,
      [
        input.organizationId,
        input.tier ?? 'standard',
        input.maxStorageBytes ?? 5368709120,
        input.maxFilms ?? 10,
        input.maxMembersPerFilm ?? 50,
        input.maxMonthlyAiTokens ?? 1000000,
        input.maxConcurrentEditors ?? 10,
        input.dataResidencyRegion ?? 'in-south-1',
        input.enforceStrictQuotas ?? true,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to upsert organization quota');
    return mapQuota(row);
  }

  // 2. Get organization quota
  async getQuota(
    organizationId: string,
    client?: PoolClient,
  ): Promise<OrganizationQuotaDto | null> {
    const res = await this.getExecutor(client).query<QuotaRow>(
      `SELECT q.*
       FROM organization_quotas q
       WHERE q.organization_id = $1
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
           WHERE om.organization_id = q.organization_id
             AND om.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [organizationId],
    );
    const row = res.rows[0];
    return row ? mapQuota(row) : null;
  }

  // 3. Server-enforced check quota allowance
  async checkQuotaAllowance(
    input: CheckQuotaAllowanceInput,
    client?: PoolClient,
  ): Promise<QuotaCheckResultDto> {
    const quota = await this.getQuota(input.organizationId, client);
    if (!quota) {
      return {
        allowed: false,
        resourceType: input.resourceType,
        limit: 0,
        currentUsage: 0,
        remaining: 0,
        reason: 'Organization quota not configured',
      };
    }

    if (!quota.enforceStrictQuotas) {
      return {
        allowed: true,
        resourceType: input.resourceType,
        limit: Number.MAX_SAFE_INTEGER,
        currentUsage: 0,
        remaining: Number.MAX_SAFE_INTEGER,
      };
    }

    if (input.resourceType === 'storage_bytes') {
      const remaining = quota.maxStorageBytes - quota.usedStorageBytes;
      const allowed = remaining >= input.requestedDelta;
      return {
        allowed,
        resourceType: 'storage_bytes',
        limit: quota.maxStorageBytes,
        currentUsage: quota.usedStorageBytes,
        remaining,
        reason: allowed
          ? undefined
          : `Requested storage ${input.requestedDelta} bytes exceeds available quota ${remaining} bytes`,
      };
    }

    if (input.resourceType === 'ai_tokens') {
      const remaining = quota.maxMonthlyAiTokens - quota.usedMonthlyAiTokens;
      const allowed = remaining >= input.requestedDelta;
      return {
        allowed,
        resourceType: 'ai_tokens',
        limit: quota.maxMonthlyAiTokens,
        currentUsage: quota.usedMonthlyAiTokens,
        remaining,
        reason: allowed
          ? undefined
          : `Requested AI tokens ${input.requestedDelta} exceeds monthly limit ${remaining} tokens remaining`,
      };
    }

    // Default allowance for other resource types
    return {
      allowed: true,
      resourceType: input.resourceType,
      limit: 1000000,
      currentUsage: 0,
      remaining: 1000000,
    };
  }

  // 4. Record usage delta atomically
  async recordUsage(
    input: RecordQuotaUsageInput,
    actorUserId: string,
    client?: PoolClient,
  ): Promise<QuotaCheckResultDto> {
    const executor = this.getExecutor(client);

    // Update quota counter
    if (input.resourceType === 'storage_bytes') {
      await executor.query(
        `UPDATE organization_quotas
         SET used_storage_bytes = GREATEST(0, used_storage_bytes + $2),
             updated_at = now()
         WHERE organization_id = $1`,
        [input.organizationId, input.delta],
      );
    } else if (input.resourceType === 'ai_tokens') {
      await executor.query(
        `UPDATE organization_quotas
         SET used_monthly_ai_tokens = GREATEST(0, used_monthly_ai_tokens + $2),
             updated_at = now()
         WHERE organization_id = $1`,
        [input.organizationId, input.delta],
      );
    }

    // Record ledger log
    await executor.query(
      `INSERT INTO quota_usage_records (
         organization_id, film_id, resource_type, delta, actor_user_id, reference_id
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.organizationId,
        input.filmId ?? null,
        input.resourceType,
        input.delta,
        actorUserId,
        input.referenceId ?? null,
      ],
    );

    const quota = await this.getQuota(input.organizationId, client);
    const currentUsage =
      input.resourceType === 'storage_bytes'
        ? quota?.usedStorageBytes ?? 0
        : quota?.usedMonthlyAiTokens ?? 0;
    const limit =
      input.resourceType === 'storage_bytes'
        ? quota?.maxStorageBytes ?? 0
        : quota?.maxMonthlyAiTokens ?? 0;

    return {
      allowed: true,
      resourceType: input.resourceType,
      limit,
      currentUsage,
      remaining: Math.max(0, limit - currentUsage),
    };
  }

  // 5. Upsert enterprise feature policy
  async upsertFeaturePolicy(
    input: UpsertEnterpriseFeaturePolicyInput,
    updatedBy: string,
    client?: PoolClient,
  ): Promise<EnterpriseFeaturePolicyDto> {
    const res = await this.getExecutor(client).query<FeaturePolicyRow>(
      `INSERT INTO enterprise_feature_policies (
         organization_id, feature_key, is_enabled, policy_rules, updated_by
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, feature_key) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         policy_rules = EXCLUDED.policy_rules,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING *`,
      [
        input.organizationId,
        input.featureKey,
        input.isEnabled ?? true,
        JSON.stringify(input.policyRules ?? {}),
        updatedBy,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to upsert enterprise feature policy');
    return mapFeaturePolicy(row);
  }

  // 6. Get feature policy
  async getFeaturePolicy(
    organizationId: string,
    featureKey: string,
    client?: PoolClient,
  ): Promise<EnterpriseFeaturePolicyDto | null> {
    const res = await this.getExecutor(client).query<FeaturePolicyRow>(
      `SELECT f.*
       FROM enterprise_feature_policies f
       WHERE f.organization_id = $1 AND f.feature_key = $2
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
           WHERE om.organization_id = f.organization_id
             AND om.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [organizationId, featureKey],
    );
    const row = res.rows[0];
    return row ? mapFeaturePolicy(row) : null;
  }

  // 7. Check if feature is enabled
  async isFeatureEnabled(
    organizationId: string,
    featureKey: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const policy = await this.getFeaturePolicy(organizationId, featureKey, client);
    return policy ? policy.isEnabled : false;
  }

  // 8. Record enterprise legal consent
  async recordLegalConsent(
    input: RecordEnterpriseLegalConsentInput,
    consentedByUserId: string,
    ipHash?: Buffer,
    client?: PoolClient,
  ): Promise<EnterpriseLegalConsentDto> {
    const res = await this.getExecutor(client).query<LegalConsentRow>(
      `INSERT INTO enterprise_legal_consents (
         organization_id, film_id, consent_type, version, consented_by_user_id, ip_hash, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.organizationId,
        input.filmId ?? null,
        input.consentType,
        input.version,
        consentedByUserId,
        ipHash ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to record legal consent');
    return mapLegalConsent(row);
  }

  // 9. List legal consents
  async listLegalConsents(
    organizationId: string,
    client?: PoolClient,
  ): Promise<EnterpriseLegalConsentDto[]> {
    const res = await this.getExecutor(client).query<LegalConsentRow>(
      `SELECT l.*
       FROM enterprise_legal_consents l
       WHERE l.organization_id = $1
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
           WHERE om.organization_id = l.organization_id
             AND om.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY l.consented_at DESC`,
      [organizationId],
    );
    return res.rows.map(mapLegalConsent);
  }

  // 10. List quota usage records for audit & administrative reporting
  async listUsageRecords(
    organizationId: string,
    limit = 50,
    client?: PoolClient,
  ): Promise<QuotaUsageRecordDto[]> {
    const res = await this.getExecutor(client).query<UsageRecordRow>(
      `SELECT r.*
       FROM quota_usage_records r
       WHERE r.organization_id = $1
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
           WHERE om.organization_id = r.organization_id
             AND om.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY r.recorded_at DESC
       LIMIT $2`,
      [organizationId, limit],
    );
    return res.rows.map(mapUsageRecord);
  }
}
