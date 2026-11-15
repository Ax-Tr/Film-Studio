import type { Pool, PoolClient } from 'pg';
import type {
  AiProviderConfigSummaryDto,
  CreateAiProviderConfigDto,
  RecordAiUsageDto,
  AiSpendSummaryDto,
} from '@film-studio/contracts';
import { KmsEnvelopeEncryption } from '../modules/ai/kms-envelope-encryption.js';

export class PostgresAiGatewayRepository {
  private readonly kms = new KmsEnvelopeEncryption();

  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create Provider Config with Envelope Encryption
  async createProviderConfig(
    data: CreateAiProviderConfigDto,
    actorUserId: string,
    client?: PoolClient
  ): Promise<AiProviderConfigSummaryDto> {
    const encrypted = this.kms.encryptSecret(data.apiKey);
    const masked = KmsEnvelopeEncryption.maskApiKey(data.apiKey);

    const res = await this.getExecutor(client).query(
      `INSERT INTO ai_provider_configurations (
         organization_id, film_id, provider, model_name,
         encrypted_api_key, key_encryption_iv, key_encryption_tag, kms_key_version,
         endpoint_url, daily_spend_limit_cents, rate_limit_rpm, timeout_ms, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, organization_id, film_id, provider, model_name, endpoint_url,
                 is_active, daily_spend_limit_cents, rate_limit_rpm, timeout_ms, created_at, updated_at`,
      [
        data.organizationId,
        data.filmId ?? null,
        data.provider,
        data.modelName,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        encrypted.kmsKeyVersion,
        data.endpointUrl ?? null,
        data.dailySpendLimitCents ?? 10000,
        data.rateLimitRpm ?? 60,
        data.timeoutMs ?? 60000,
        actorUserId,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      filmId: row.film_id,
      provider: row.provider,
      modelName: row.model_name,
      maskedApiKey: masked,
      endpointUrl: row.endpoint_url,
      isActive: row.is_active,
      dailySpendLimitCents: row.daily_spend_limit_cents,
      rateLimitRpm: row.rate_limit_rpm,
      timeoutMs: row.timeout_ms,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  // 2. List Provider Configs (API Keys strictly masked, never returned in plaintext)
  async listProviderConfigs(
    organizationId: string,
    client?: PoolClient
  ): Promise<AiProviderConfigSummaryDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, organization_id, film_id, provider, model_name, endpoint_url,
              is_active, daily_spend_limit_cents, rate_limit_rpm, timeout_ms, created_at, updated_at
       FROM ai_provider_configurations
       WHERE organization_id = $1
         AND (
           EXISTS (
             SELECT 1 FROM organization_memberships om
             WHERE om.organization_id = ai_provider_configurations.organization_id
               AND om.user_id = app_security.current_user_id()
           )
           OR EXISTS (
             SELECT 1 FROM film_memberships fm
             JOIN films f ON f.id = fm.film_id
             WHERE f.organization_id = ai_provider_configurations.organization_id
               AND fm.user_id = app_security.current_user_id()
               AND fm.status = 'active'
           )
         )
       ORDER BY provider ASC, model_name ASC`,
      [organizationId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      filmId: row.film_id,
      provider: row.provider,
      modelName: row.model_name,
      maskedApiKey: 'sk-****[REDACTED]',
      endpointUrl: row.endpoint_url,
      isActive: row.is_active,
      dailySpendLimitCents: row.daily_spend_limit_cents,
      rateLimitRpm: row.rate_limit_rpm,
      timeoutMs: row.timeout_ms,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  // 3. Decrypt API Key (Internal backend execution only)
  async getDecryptedApiKey(configId: string, client?: PoolClient): Promise<string> {
    const res = await this.getExecutor(client).query(
      `SELECT encrypted_api_key, key_encryption_iv, key_encryption_tag
       FROM ai_provider_configurations
       WHERE id = $1`,
      [configId]
    );

    if (res.rows.length === 0) {
      throw new Error(`AI Provider config ${configId} not found`);
    }

    const row = res.rows[0];
    return this.kms.decryptSecret(
      row.encrypted_api_key,
      row.key_encryption_iv,
      row.key_encryption_tag
    );
  }

  // 4. Record Usage in Ledger
  async recordUsage(data: RecordAiUsageDto, client?: PoolClient): Promise<void> {
    const totalTokens = data.promptTokens + data.completionTokens;
    await this.getExecutor(client).query(
      `INSERT INTO ai_usage_ledger (
         organization_id, film_id, config_id, actor_user_id,
         prompt_tokens, completion_tokens, total_tokens, cost_cents,
         operation_kind, request_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        data.organizationId,
        data.filmId ?? null,
        data.configId,
        data.actorUserId,
        data.promptTokens,
        data.completionTokens,
        totalTokens,
        data.costCents,
        data.operationKind,
        data.requestHash,
      ]
    );
  }

  // 5. Check Spend Ceilings & Rate Limits
  async checkSpendAndRateLimits(
    organizationId: string,
    configId: string,
    client?: PoolClient
  ): Promise<AiSpendSummaryDto> {
    const configRes = await this.getExecutor(client).query(
      `SELECT daily_spend_limit_cents
       FROM ai_provider_configurations
       WHERE id = $1 AND organization_id = $2`,
      [configId, organizationId]
    );

    if (configRes.rows.length === 0) {
      throw new Error(`Provider configuration not found`);
    }

    const dailyLimitCents = configRes.rows[0].daily_spend_limit_cents;

    // Sum spend for today
    const spendRes = await this.getExecutor(client).query(
      `SELECT COALESCE(SUM(cost_cents), 0)::integer AS spent_today,
              COUNT(*)::integer AS recent_count
       FROM ai_usage_ledger
       WHERE organization_id = $1
         AND created_at >= date_trunc('day', now())`,
      [organizationId]
    );

    const spentToday = Number(spendRes.rows[0].spent_today);
    const count = Number(spendRes.rows[0].recent_count);

    return {
      organizationId,
      totalSpentTodayCents: spentToday,
      dailyLimitCents,
      isLimitExceeded: spentToday >= dailyLimitCents,
      recentRequestsCount: count,
    };
  }
}
