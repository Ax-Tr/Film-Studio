import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresAiGatewayRepository } from '../apps/api/src/database/postgres-ai-gateway.repository.js';
import { KmsEnvelopeEncryption } from '../apps/api/src/modules/ai/kms-envelope-encryption.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-a999-79aa-94a6-09195b7d9999';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

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

    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${userOne}', 'Studio Owner', 'owner@studio.test'),
        ('${userTwo}', 'Rival Studio Owner', 'rival@studio.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'AI Studio Epic');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Isolated Rival Production');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Isolated Film');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresAiGatewayRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Envelope Encryption & Provider Configuration
      const rawOpenAiKey = 'sk-proj-securekey-test-998877665544332211';
      const rawGeminiKey = 'AIzaSyD-gemini-secure-test-abcdefghij12345';

      const openAiConfig = await repo.createProviderConfig(
        {
          organizationId: organizationOne,
          filmId: filmOne,
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: rawOpenAiKey,
          dailySpendLimitCents: 5000, // $50 daily ceiling
          rateLimitRpm: 30,
        },
        userOne,
        client
      );

      assert.equal(openAiConfig.provider, 'openai');
      assert.equal(openAiConfig.modelName, 'gpt-4o');
      assert.ok(openAiConfig.maskedApiKey.startsWith('sk-p...'));
      assert.ok(!openAiConfig.maskedApiKey.includes('998877665544332211'), 'Plain key not in masked view');

      const geminiConfig = await repo.createProviderConfig(
        {
          organizationId: organizationOne,
          filmId: filmOne,
          provider: 'gemini',
          modelName: 'gemini-1.5-pro',
          apiKey: rawGeminiKey,
          dailySpendLimitCents: 2000, // $20 daily ceiling
          rateLimitRpm: 60,
        },
        userOne,
        client
      );

      // Verify List Summaries - Zero secret leakage
      const configs = await repo.listProviderConfigs(organizationOne, client);
      assert.equal(configs.length, 2);
      for (const cfg of configs) {
        assert.ok(!cfg.maskedApiKey.includes('securekey'));
        assert.ok(!cfg.maskedApiKey.includes('gemini-secure'));
      }

      // Verify internal backend decryption recovers exact credential
      const decryptedOpenAiKey = await repo.getDecryptedApiKey(openAiConfig.id, client);
      assert.equal(decryptedOpenAiKey, rawOpenAiKey, 'Decrypted key matches exact original');

      const decryptedGeminiKey = await repo.getDecryptedApiKey(geminiConfig.id, client);
      assert.equal(decryptedGeminiKey, rawGeminiKey, 'Decrypted Gemini key matches exact original');

      // 2. Request Hashing and Zero Screenplay Text Leakage
      const promptContext = {
        sceneId: '018f4ce4-e111-7000-8000-000000000001',
        teluguDialogue: 'రాజ్యం కోసం పోరాటం మొదలైంది',
        operation: 'character_arc',
      };
      const requestHash = KmsEnvelopeEncryption.hashRequest(promptContext);
      assert.equal(requestHash.length, 64);

      // 3. Usage Accounting & Ledger
      await repo.recordUsage(
        {
          organizationId: organizationOne,
          filmId: filmOne,
          configId: openAiConfig.id,
          actorUserId: userOne,
          promptTokens: 1200,
          completionTokens: 450,
          costCents: 150, // $1.50
          operationKind: 'analysis',
          requestHash,
        },
        client
      );

      await repo.recordUsage(
        {
          organizationId: organizationOne,
          filmId: filmOne,
          configId: openAiConfig.id,
          actorUserId: userOne,
          promptTokens: 2500,
          completionTokens: 1200,
          costCents: 350, // $3.50
          operationKind: 'proposal',
          requestHash,
        },
        client
      );

      // 4. Spend Limits & Ceiling Enforcement
      const spendStatusBefore = await repo.checkSpendAndRateLimits(
        organizationOne,
        openAiConfig.id,
        client
      );
      assert.equal(spendStatusBefore.totalSpentTodayCents, 500); // $5.00
      assert.equal(spendStatusBefore.isLimitExceeded, false);

      // Record a large request that hits the $50 daily ceiling
      await repo.recordUsage(
        {
          organizationId: organizationOne,
          filmId: filmOne,
          configId: openAiConfig.id,
          actorUserId: userOne,
          promptTokens: 50000,
          completionTokens: 25000,
          costCents: 4600, // $46.00 (Total: $51.00 > $50.00 ceiling)
          operationKind: 'coverage',
          requestHash: KmsEnvelopeEncryption.hashRequest({ batch: 'deep_coverage' }),
        },
        client
      );

      const spendStatusAfter = await repo.checkSpendAndRateLimits(
        organizationOne,
        openAiConfig.id,
        client
      );
      assert.equal(spendStatusAfter.totalSpentTodayCents, 5100);
      assert.equal(spendStatusAfter.isLimitExceeded, true, 'Spend ceiling correctly triggered');

      // 5. Multi-Tenant RLS Isolation
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderConfigs = await repo.listProviderConfigs(organizationOne, client);
      assert.equal(intruderConfigs.length, 0, 'Intruder cannot see configurations of other organization');

      process.stdout.write('Sprint 25 AI Provider Gateway & Secret Controls verified successfully.\n');
    } finally {
      client.release();
      await pool.end();
    }
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
