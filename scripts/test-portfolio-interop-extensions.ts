import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresInteropRepository } from '../apps/api/src/database/postgres-interop.repository.js';

// Users
const producerUser = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const rivalUser = '018f4ce4-82c4-7808-ae50-28293c570bd5';

// Orgs and Films
const orgSuresh = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const orgRival = '018f4ce4-a888-79aa-94a6-09195b7d8888';
const film1 = '018f4ce4-b3df-75c9-8d26-424bb512c0cf'; // Rudra Veena
const film2 = '018f4ce4-b444-75c9-8d26-424bb512c0aa'; // Swarna Kamalam
const filmRival = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

const doc1 = '018f4ce4-c111-7000-8000-000000000011';
const doc2 = '018f4ce4-c222-7000-8000-000000000022';

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

    // Seed users, orgs, films, documents and scenes
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${producerUser}', 'Suresh Daggubati', 'suresh@studio.test'),
        ('${rivalUser}', 'Rival Spy', 'spy@rival.test');

      SELECT set_config('app.user_id', '${producerUser}', false);
      SELECT app_security.create_organization('${orgSuresh}', 'Suresh Productions');
      SELECT app_security.create_film('${film1}', '${orgSuresh}', 'రుద్రవీణ (Rudra Veena)');
      SELECT app_security.create_film('${film2}', '${orgSuresh}', 'స్వర్ణకమలం (Swarna Kamalam)');

      SELECT set_config('app.user_id', '${rivalUser}', false);
      SELECT app_security.create_organization('${orgRival}', 'Rival Studios');
      SELECT app_security.create_film('${filmRival}', '${orgRival}', 'Rival Film');
    `);

    const pool = new Pool(createPgConfig(database));

    // Switch back to Suresh session
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [producerUser]);

    // Insert documents, scenes, and budgets
    await pool.query(
      `INSERT INTO documents (id, film_id, title, kind, language, created_by) VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
      [doc1, film1, 'Screenplay Rudra Veena', 'screenplay', 'te-IN', producerUser, doc2, film2, 'Screenplay Swarna Kamalam', 'screenplay', 'te-IN', producerUser],
    );

    await pool.query(
      `INSERT INTO scenes (id, film_id, document_id, slugline) VALUES
        ('018f4ce4-d111-7000-8000-000000000001', '${film1}', '${doc1}', 'INT. TEMPLE MANDAPAM - DAY'),
        ('018f4ce4-d222-7000-8000-000000000002', '${film1}', '${doc1}', 'EXT. RIVER GODAVARI - SUNSET'),
        ('018f4ce4-d333-7000-8000-000000000003', '${film2}', '${doc2}', 'INT. NATYA SHALA - MORNING')`,
    );

    const budgetId = '018f4ce4-e111-7000-8000-000000000001';
    await pool.query(
      `INSERT INTO production_budgets (id, film_id, title, created_by) VALUES
        ($1, $2, 'Main Production Budget', $3)`,
      [budgetId, film1, producerUser],
    );

    await pool.query(
      `INSERT INTO budget_line_items (
        film_id, budget_id, account_code, category, description,
        quantity, unit, unit_rate_cents, low_estimate_cents, estimated_total_cents, high_estimate_cents
      ) VALUES (
        $1, $2, '1001', 'above_the_line', 'Music & Composition',
        1, 'flat', 1500000000, 1500000000, 1500000000, 1500000000
      )`,
      [film1, budgetId],
    );

    const repo = new PostgresInteropRepository(pool);

    // =========================================================================
    // 1. Organization Portfolio Creation and Aggregation
    // =========================================================================
    process.stdout.write('Test 1: Creating organization portfolio and aggregating film metrics...\n');
    const portfolio = await repo.createPortfolio({
      organizationId: orgSuresh,
      name: '2026 Telugu Heritage Slate',
      description: 'Classics restoration and cinematic development slate',
      metadata: { focus: 'Classical Arts', fiscalYear: 2026 },
    });
    assert.equal(portfolio.name, '2026 Telugu Heritage Slate');
    assert.equal(portfolio.filmCount, 0);

    await repo.assignFilmToPortfolio(portfolio.id, film1);
    await repo.assignFilmToPortfolio(portfolio.id, film2);

    const summary = await repo.getPortfolioSummary(portfolio.id, orgSuresh);
    assert.ok(summary);
    assert.equal(summary.filmCount, 2);
    assert.equal(summary.totalScenes, 3);
    assert.equal(summary.totalEstimatedBudgetPaise, 1500000000);

    // =========================================================================
    // 2. File Interoperability - Full Format Matrix Verification
    // =========================================================================
    process.stdout.write('Test 2: Validating import/export jobs across format matrix (PDF, DOCX, TXT, Fountain, FDX, CSV, XLSX)...\n');
    const formats = ['pdf', 'docx', 'txt', 'fountain', 'fdx', 'csv', 'xlsx'] as const;

    for (const fmt of formats) {
      const job = await repo.createFileInteropJob({
        filmId: film1,
        jobType: 'export',
        format: fmt,
        inputMetadata: { includeDialogueTimings: true, scriptLanguage: 'te-IN' },
        retainedSourceOnFailure: true,
        createdBy: producerUser,
      });
      assert.equal(job.status, 'queued');
      assert.equal(job.format, fmt);
      assert.equal(job.retainedSourceOnFailure, true);

      const completed = await repo.updateFileInteropJobStatus(job.id, film1, 'completed', {
        resultFileStorageKey: `exports/${film1}/${job.id}.${fmt}`,
        outputSummary: { byteSize: 204850, checksumSha256: 'a1b2c3d4e5f6' },
        conformanceReport: {
          standardsCompliant: true,
          unicodeNfcVerified: true,
          teluguGlyphCoverage: 1.0,
        },
      });
      assert.ok(completed);
      assert.equal(completed.status, 'completed');
      assert.equal(completed.resultFileStorageKey, `exports/${film1}/${job.id}.${fmt}`);
    }

    // =========================================================================
    // 3. Failed Import Source Retention
    // =========================================================================
    process.stdout.write('Test 3: Validating failed import source retention...\n');
    const failJob = await repo.createFileInteropJob({
      filmId: film1,
      jobType: 'import',
      format: 'fdx',
      sourceFileStorageKey: `uploads/${film1}/corrupted-draft.fdx`,
      retainedSourceOnFailure: true,
      createdBy: producerUser,
    });
    const failed = await repo.updateFileInteropJobStatus(failJob.id, film1, 'failed', {
      errorMessage: 'Malformed XML at line 14: unclosed tag <Paragraph>',
    });
    assert.ok(failed);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.retainedSourceOnFailure, true);
    assert.equal(failed.sourceFileStorageKey, `uploads/${film1}/corrupted-draft.fdx`);

    // =========================================================================
    // 4. Extension Sandbox Manifest & Security Policy
    // =========================================================================
    process.stdout.write('Test 4: Registering and gating extension manifest with sandbox permissions...\n');
    const ext = await repo.registerExtension({
      organizationId: orgSuresh,
      extensionIdentifier: 'com.telugu.screenplay.rhyme-checker',
      version: '1.0.0',
      name: 'Telugu Prasa & Rhyme Assistant',
      description: 'Validates classical Telugu Prasa rules in dialogue lines',
      sandboxPermissions: ['screenplay:read', 'network:restricted'],
      allowedEndpoints: ['https://api.teluguliterature.org/prasa/v1'],
      isVerified: true,
    });
    assert.equal(ext.extensionIdentifier, 'com.telugu.screenplay.rhyme-checker');
    assert.ok(ext.sandboxPermissions.includes('screenplay:read'));
    assert.ok(ext.sandboxPermissions.includes('network:restricted'));

    // =========================================================================
    // 5. Extension Audit Logging & Sandbox Boundary Enforcement
    // =========================================================================
    process.stdout.write('Test 5: Logging extension access with sandbox boundary enforcement...\n');
    const audit = await repo.logExtensionAudit(
      ext.id,
      orgSuresh,
      'screenplay.read_scene',
      'scene:INT. TEMPLE MANDAPAM - DAY',
      true,
      { dialogueWordsEvaluated: 142, prasaScore: 0.96 },
      producerUser,
    );
    assert.equal(audit.sandboxBoundaryEnforced, true);
    assert.equal(audit.action, 'screenplay.read_scene');

    // =========================================================================
    // 6. Strict Multi-Tenant Isolation
    // =========================================================================
    process.stdout.write('Test 6: Verifying strict multi-tenant isolation against rival organization...\n');
    const rivalPortfolio = await repo.getPortfolioSummary(portfolio.id, orgRival);
    assert.equal(rivalPortfolio, null, 'Rival org must not access Suresh portfolio');

    const rivalExt = await repo.getExtensionManifest(ext.id, orgRival);
    assert.equal(rivalExt, null, 'Rival org must not access Suresh extension manifest');

    process.stdout.write('✅ All 6 Portfolio, Interoperability & Extension checks PASSED successfully!\n');
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Test failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
