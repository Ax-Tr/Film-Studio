import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresAiProposalRepository } from '../apps/api/src/database/postgres-ai-proposal.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-a999-79aa-94a6-09195b7d9999';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const documentOne = '018f4ce4-d100-7000-8000-000000000001';

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

    // Seed users, orgs, films, documents, and an AI provider config
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${userOne}', 'Studio Owner', 'owner@studio.test'),
        ('${userTwo}', 'Rival Owner', 'rival@studio.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'AI Proposal Film');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Rival Productions');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Isolated Film');
    `);

    // Seed a document and an AI provider config for userOne
    await database.exec(`
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by)
      VALUES ('${documentOne}', '${filmOne}', 'మహారాజు', 'screenplay', 'te-IN', '${userOne}');

      INSERT INTO ai_provider_configurations (
        id, organization_id, film_id, provider, model_name,
        encrypted_api_key, key_encryption_iv, key_encryption_tag,
        kms_key_version, created_by, daily_spend_limit_cents,
        rate_limit_rpm, timeout_ms
      ) VALUES (
        '018f4ce4-e200-7000-8000-000000000001',
        '${organizationOne}', '${filmOne}', 'gemini', 'gemini-1.5-pro',
        '\\x0123456789abcdef0123456789abcdef', '\\x0123456789abcdef01234567', '\\x0123456789abcdef0123456789abcdef',
        'v1', '${userOne}', 10000, 60, 60000
      );
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresAiProposalRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      const contextHash = crypto.createHash('sha256').update('test context for proposal').digest('hex');

      // 1. Create a content manifest with version snapshot
      const manifest = await repo.createManifest(
        {
          filmId: filmOne,
          documentId: documentOne,
          configId: '018f4ce4-e200-7000-8000-000000000001',
          documentVersion: 3,
          selectedSceneIds: [],
          selectedCharacterIds: [],
          contextSummaryHash: contextHash,
          operationKind: 'dialogue_polish',
          language: 'te-IN',
        },
        userOne,
        client,
      );

      assert.equal(manifest.filmId, filmOne);
      assert.equal(manifest.documentVersion, 3);
      assert.equal(manifest.operationKind, 'dialogue_polish');
      assert.equal(manifest.status, 'consent_pending');
      assert.equal(manifest.consentGranted, false);
      assert.equal(manifest.consentGrantedAt, null);
      assert.equal(manifest.contextSummaryHash, contextHash);
      process.stdout.write('  ✓ Manifest creation with version snapshot\n');

      // 2. Grant explicit consent
      const consentedManifest = await repo.grantConsent(manifest.id, filmOne, client);
      assert.equal(consentedManifest.consentGranted, true);
      assert.ok(consentedManifest.consentGrantedAt !== null, 'consent_granted_at is set');
      assert.equal(consentedManifest.status, 'consented');
      process.stdout.write('  ✓ Explicit consent granting\n');

      // 3. Create proposals with Telugu content (NFC preservation)
      const teluguOriginal = 'రాజు గుర్రం ఎక్కి బయలుదేరాడు';
      const teluguProposed = 'మహారాజు వీర గుర్రం ఎక్కి యుద్ధానికి బయలుదేరాడు';

      const proposal1 = await repo.createProposal(
        {
          filmId: filmOne,
          manifestId: manifest.id,
          contentType: 'dialogue',
          originalText: teluguOriginal,
          proposedText: teluguProposed,
          rationale: 'Enhanced dramatic intensity with royal address',
          confidenceScore: 0.87,
          promptTokens: 450,
          completionTokens: 120,
        },
        client,
      );

      assert.equal(proposal1.proposalIndex, 1);
      assert.equal(proposal1.contentType, 'dialogue');
      assert.equal(proposal1.originalText, teluguOriginal);
      assert.equal(proposal1.proposedText, teluguProposed);
      assert.equal(proposal1.decision, 'pending');
      assert.equal(proposal1.confidenceScore, 0.87);
      assert.equal(proposal1.promptTokens, 450);
      process.stdout.write('  ✓ Proposal creation with Telugu NFC text\n');

      // Second proposal (action line)
      const proposal2 = await repo.createProposal(
        {
          filmId: filmOne,
          manifestId: manifest.id,
          contentType: 'action_line',
          originalText: 'The king rides away.',
          proposedText: 'The king mounts his war horse and gallops toward the battlefield.',
          rationale: 'More visual detail for cinematography',
          confidenceScore: 0.72,
          promptTokens: 300,
          completionTokens: 80,
        },
        client,
      );

      assert.equal(proposal2.proposalIndex, 2, 'Auto-incremented proposal index');
      process.stdout.write('  ✓ Auto-incrementing proposal index\n');

      // 4. List proposals
      const proposals = await repo.listProposals(manifest.id, filmOne, client);
      assert.equal(proposals.length, 2);
      assert.equal(proposals[0].proposalIndex, 1);
      assert.equal(proposals[1].proposalIndex, 2);
      process.stdout.write('  ✓ List proposals ordered by index\n');

      // 5. Accept proposal 1
      const accepted = await repo.decideProposal(
        proposal1.id,
        filmOne,
        userOne,
        { decision: 'accepted' },
        client,
      );
      assert.equal(accepted.decision, 'accepted');
      assert.equal(accepted.decidedBy, userOne);
      assert.ok(accepted.decidedAt !== null, 'decidedAt is set');
      process.stdout.write('  ✓ Accept proposal decision\n');

      // 6. Reject proposal 2
      const rejected = await repo.decideProposal(
        proposal2.id,
        filmOne,
        userOne,
        { decision: 'rejected' },
        client,
      );
      assert.equal(rejected.decision, 'rejected');
      process.stdout.write('  ✓ Reject proposal decision\n');

      // 7. Create and edit a third proposal (with edited_text)
      const proposal3 = await repo.createProposal(
        {
          filmId: filmOne,
          manifestId: manifest.id,
          contentType: 'character_note',
          originalText: 'Character is brave.',
          proposedText: 'Character is a fearless warrior with a hidden vulnerability.',
          promptTokens: 200,
          completionTokens: 60,
        },
        client,
      );

      const edited = await repo.decideProposal(
        proposal3.id,
        filmOne,
        userOne,
        {
          decision: 'edited',
          editedText: 'Character is a courageous warrior with a fear of betrayal.',
        },
        client,
      );
      assert.equal(edited.decision, 'edited');
      assert.equal(edited.editedText, 'Character is a courageous warrior with a fear of betrayal.');
      process.stdout.write('  ✓ Edit proposal with custom text\n');

      // 8. Manifest summary (decision counts)
      const summary = await repo.getManifestSummary(manifest.id, filmOne, client);
      assert.equal(summary.operationKind, 'dialogue_polish');
      assert.equal(summary.status, 'consented');
      assert.equal(summary.consentGranted, true);
      assert.equal(summary.totalProposals, 3);
      assert.equal(summary.acceptedCount, 1);
      assert.equal(summary.rejectedCount, 1);
      assert.equal(summary.editedCount, 1);
      assert.equal(summary.pendingCount, 0);
      process.stdout.write('  ✓ Manifest summary with decision counts\n');

      // 9. List manifests for film
      const manifests = await repo.listManifests(filmOne, client);
      assert.equal(manifests.length, 1);
      assert.equal(manifests[0].id, manifest.id);
      process.stdout.write('  ✓ List manifests for film\n');

      // 10. Multi-tenant RLS Isolation
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderManifests = await repo.listManifests(filmOne, client);
      assert.equal(intruderManifests.length, 0, 'Intruder sees 0 manifests');

      const intruderProposals = await repo.listProposals(manifest.id, filmOne, client);
      assert.equal(intruderProposals.length, 0, 'Intruder sees 0 proposals');

      process.stdout.write('  ✓ Multi-tenant RLS isolation verified\n');

      process.stdout.write('Sprint 26 AI Proposal Workflow verified successfully.\n');
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
