import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresEnterpriseQuotaRepository } from '../apps/api/src/database/postgres-enterprise-quota.repository.js';

// Users
const ownerUser = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';   // Org Owner / Producer
const rivalUser = '018f4ce4-82c4-7808-ae50-28293c570bd5';   // Rival Org User
const superAdminUser = '018f4ce4-8a12-7001-be12-333344445555';// Super Admin

// Organizations
const orgMythri = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const orgRival = '018f4ce4-a888-79aa-94a6-09195b7d8888';

async function main(): Promise<void> {
  const database = new PGlite();
  const migrationDirectory = fileURLToPath(
    new URL('../infra/database/migrations/', import.meta.url),
  );
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();

  try {
    for (const name of migrationNames) {
      await database.exec(
        await readFile(
          new URL(`../infra/database/migrations/${name}`, import.meta.url),
          'utf8',
        ),
      );
    }

    // Seed users, orgs, and memberships
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${ownerUser}', 'Naveen Yerneni', 'naveen@mythri.test'),
        ('${rivalUser}', 'Rival Producer', 'rival@isolated.test'),
        ('${superAdminUser}', 'Super Admin Ops', 'ops@platform.test');

      -- Set Owner session to create org
      SELECT set_config('app.user_id', '${ownerUser}', false);
      SELECT app_security.create_organization('${orgMythri}', 'Mythri Movie Makers Enterprise');

      -- Set Rival session to create rival org
      SELECT set_config('app.user_id', '${rivalUser}', false);
      SELECT app_security.create_organization('${orgRival}', 'Isolated Studio Org');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresEnterpriseQuotaRepository(pool);

    // Switch session to Owner
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [ownerUser]);

    // =========================================================================
    // 1. Quota Configuration with Data Residency
    // =========================================================================
    process.stdout.write('Test 1: Configuring organization quotas with India data residency...\n');
    const tenGb = 10 * 1024 * 1024 * 1024; // 10 GB
    const fiveMillionTokens = 5000000;

    const quota = await repo.upsertQuota({
      organizationId: orgMythri,
      tier: 'enterprise',
      maxStorageBytes: tenGb,
      maxMonthlyAiTokens: fiveMillionTokens,
      maxFilms: 25,
      maxMembersPerFilm: 100,
      dataResidencyRegion: 'in-south-1',
      enforceStrictQuotas: true,
    });

    assert.equal(quota.organizationId, orgMythri);
    assert.equal(quota.tier, 'enterprise');
    assert.equal(quota.maxStorageBytes, tenGb);
    assert.equal(quota.maxMonthlyAiTokens, fiveMillionTokens);
    assert.equal(quota.dataResidencyRegion, 'in-south-1');
    assert.equal(quota.enforceStrictQuotas, true);

    // =========================================================================
    // 2. Server-Enforced Storage Quota Allowance & Rejection
    // =========================================================================
    process.stdout.write('Test 2: Server-enforced storage quota checks and overage rejection...\n');
    const fourGb = 4 * 1024 * 1024 * 1024;
    const eightGb = 8 * 1024 * 1024 * 1024;
    const threeGb = 3 * 1024 * 1024 * 1024;

    // Check allowance for 4 GB -> should be allowed
    const allow1 = await repo.checkQuotaAllowance({
      organizationId: orgMythri,
      resourceType: 'storage_bytes',
      requestedDelta: fourGb,
    });
    assert.equal(allow1.allowed, true);
    assert.equal(allow1.remaining, tenGb);

    // Record usage of 8 GB
    await repo.recordUsage(
      {
        organizationId: orgMythri,
        resourceType: 'storage_bytes',
        delta: eightGb,
      },
      ownerUser,
    );

    // Now used = 8 GB, remaining = 2 GB. Requesting 3 GB must be rejected by server
    const allow2 = await repo.checkQuotaAllowance({
      organizationId: orgMythri,
      resourceType: 'storage_bytes',
      requestedDelta: threeGb,
    });
    assert.equal(allow2.allowed, false, 'Server must reject storage exceeding remaining quota');
    assert.ok(allow2.reason?.includes('exceeds available quota'));
    assert.equal(allow2.remaining, 2 * 1024 * 1024 * 1024);

    // =========================================================================
    // 3. Server-Enforced AI Token Budget Ceiling
    // =========================================================================
    process.stdout.write('Test 3: Server-enforced AI token ceiling and monthly cap...\n');
    // Check allowance for 2M tokens -> allowed
    const aiCheck1 = await repo.checkQuotaAllowance({
      organizationId: orgMythri,
      resourceType: 'ai_tokens',
      requestedDelta: 2000000,
    });
    assert.equal(aiCheck1.allowed, true);

    // Record consumption of 4.5M tokens
    await repo.recordUsage(
      {
        organizationId: orgMythri,
        resourceType: 'ai_tokens',
        delta: 4500000,
      },
      ownerUser,
    );

    // Requesting 1M tokens when only 500k remaining must be rejected
    const aiCheck2 = await repo.checkQuotaAllowance({
      organizationId: orgMythri,
      resourceType: 'ai_tokens',
      requestedDelta: 1000000,
    });
    assert.equal(aiCheck2.allowed, false, 'Server must reject AI generation exceeding token ceiling');
    assert.ok(aiCheck2.reason?.includes('exceeds monthly limit'));
    assert.equal(aiCheck2.remaining, 500000);

    // =========================================================================
    // 4. Enterprise Feature Governance & Policy Gating
    // =========================================================================
    process.stdout.write('Test 4: Enterprise feature gating and policy configuration...\n');
    const featurePolicy = await repo.upsertFeaturePolicy(
      {
        organizationId: orgMythri,
        featureKey: 'advanced_telugu_nlp',
        isEnabled: true,
        policyRules: {
          allowedModels: ['gemini-1.5-pro', 'claude-3-5-sonnet'],
          requireConsent: true,
          auditRetentionDays: 365,
        },
      },
      ownerUser,
    );
    assert.equal(featurePolicy.featureKey, 'advanced_telugu_nlp');
    assert.equal(featurePolicy.isEnabled, true);

    const isEnabled = await repo.isFeatureEnabled(orgMythri, 'advanced_telugu_nlp');
    assert.equal(isEnabled, true);

    // Disable feature
    await repo.upsertFeaturePolicy(
      {
        organizationId: orgMythri,
        featureKey: 'advanced_telugu_nlp',
        isEnabled: false,
      },
      ownerUser,
    );
    const isDisabled = await repo.isFeatureEnabled(orgMythri, 'advanced_telugu_nlp');
    assert.equal(isDisabled, false);

    // =========================================================================
    // 5. Enterprise Legal & Privacy Consents (DPA, AI Opt-Out)
    // =========================================================================
    process.stdout.write('Test 5: Enterprise legal consent and AI training opt-out...\n');
    const ipHash = randomBytes(32);

    const dpaConsent = await repo.recordLegalConsent(
      {
        organizationId: orgMythri,
        consentType: 'data_processing_agreement',
        version: 'v2026.1',
        metadata: {
          jurisdiction: 'India / IT Act 2000 & DPDP Act 2023',
          signatoryRole: 'Managing Director',
        },
      },
      ownerUser,
      ipHash,
    );
    assert.equal(dpaConsent.consentType, 'data_processing_agreement');
    assert.equal(dpaConsent.version, 'v2026.1');

    const aiOptOut = await repo.recordLegalConsent(
      {
        organizationId: orgMythri,
        consentType: 'ai_training_opt_out',
        version: 'v1.0',
        metadata: {
          prohibitModelTraining: true,
          prohibitTelemetryMining: true,
        },
      },
      ownerUser,
      ipHash,
    );
    assert.equal(aiOptOut.consentType, 'ai_training_opt_out');

    const consents = await repo.listLegalConsents(orgMythri);
    assert.equal(consents.length, 2);

    // =========================================================================
    // 6. Strict Multi-Tenant Isolation
    // =========================================================================
    process.stdout.write('Test 6: Strict multi-tenant isolation against rival organization...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [rivalUser]);

    const rivalQuota = await repo.getQuota(orgMythri);
    assert.equal(rivalQuota, null, 'Rival cannot view another org quota');

    const rivalFeature = await repo.getFeaturePolicy(orgMythri, 'advanced_telugu_nlp');
    assert.equal(rivalFeature, null, 'Rival cannot view another org feature policy');

    const rivalConsents = await repo.listLegalConsents(orgMythri);
    assert.equal(rivalConsents.length, 0, 'Rival cannot view another org legal consents');

    // =========================================================================
    // 7. Super Admin Silent Content Access Block (Negative Test)
    // =========================================================================
    process.stdout.write('Test 7: Super Admin silent access prevention without break-glass session...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [superAdminUser]);

    // Super Admin without membership cannot read org quota
    const adminQuota = await repo.getQuota(orgMythri);
    assert.equal(adminQuota, null, 'Super Admin cannot silently view org quota without break-glass');

    const adminConsents = await repo.listLegalConsents(orgMythri);
    assert.equal(adminConsents.length, 0, 'Super Admin cannot silently view legal consents');

    await pool.end();
    await database.close();

    process.stdout.write('✅ All 7 Quotas and Enterprise Readiness checks PASSED successfully!\n');
  } catch (error) {
    process.stderr.write(`❌ Quotas and enterprise readiness test failed: ${error}\n`);
    await database.close();
    process.exit(1);
  }
}

main();
