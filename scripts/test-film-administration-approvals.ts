import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresFilmAdminRepository } from '../backend/src/database/postgres-film-admin.repository.js';

// Users
const producerUser = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4'; // Primary Owner / Executive Producer
const directorUser = '018f4ce4-82c4-7808-ae50-28293c570bd5'; // Director / Co-Approver
const adminUser = '018f4ce4-8a12-7001-be12-333344445555';    // Super Admin / Break-Glass operator
const rivalUser = '018f4ce4-8999-79aa-94a6-09195b7d9999';    // Rival / Intruder

// Orgs and Films
const orgStudio = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const orgRival = '018f4ce4-a888-79aa-94a6-09195b7d8888';
const filmKalki = '018f4ce4-b3df-75c9-8d26-424bb512c0cf'; // Kalki 2898 AD Part 2
const filmRival = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

// Target Entities
const budgetId = '018f4ce4-c111-7000-8000-000000000011';
const scriptDocId = '018f4ce4-c222-7000-8000-000000000022';

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

    // Seed users, orgs, films, and memberships
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${producerUser}', 'C. Aswani Dutt', 'aswani@vyjayanthi.test'),
        ('${directorUser}', 'Nag Ashwin', 'nagi@vyjayanthi.test'),
        ('${adminUser}', 'Platform Super Admin', 'ops@storyforge.test'),
        ('${rivalUser}', 'Rival Spy', 'spy@rival.test');

      -- Set Producer session to create org & film
      SELECT set_config('app.user_id', '${producerUser}', false);
      SELECT app_security.create_organization('${orgStudio}', 'Vyjayanthi Movies');
      SELECT app_security.create_film('${filmKalki}', '${orgStudio}', 'కల్కి 2898 AD - భాగం 2 (Kalki Sequel)');

      -- Add Director to film memberships
      INSERT INTO film_memberships (film_id, user_id, status) VALUES
        ('${filmKalki}', '${directorUser}', 'active');

      -- Rival Org and Film
      SELECT set_config('app.user_id', '${rivalUser}', false);
      SELECT app_security.create_organization('${orgRival}', 'Rival Studio');
      SELECT app_security.create_film('${filmRival}', '${orgRival}', 'Rival Film');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresFilmAdminRepository(pool);

    // Switch session to Producer
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [producerUser]);

    // =========================================================================
    // 1. Approval Policy Creation & Updates
    // =========================================================================
    process.stdout.write('Test 1: Creating film approval policies...\n');
    const budgetPolicy = await repo.upsertApprovalPolicy({
      filmId: filmKalki,
      policyType: 'production_budget',
      name: 'ప్రొడక్షన్ బడ్జెట్ లాకింగ్ పాలసీ',
      description: 'Requires both Producer and Director approval before release',
      requiredRoleKeys: ['producer', 'director'],
      minApprovals: 2,
      isSequential: false,
    });

    assert.equal(budgetPolicy.filmId, filmKalki);
    assert.equal(budgetPolicy.policyType, 'production_budget');
    assert.equal(budgetPolicy.minApprovals, 2);
    assert.ok(budgetPolicy.name.includes('ప్రొడక్షన్ బడ్జెట్'));

    const scriptPolicy = await repo.upsertApprovalPolicy({
      filmId: filmKalki,
      policyType: 'screenplay_draft',
      name: 'స్క్రిప్ట్ డ్రాఫ్ట్ ఆమోద పాలసీ',
      description: 'Single lead approver needed for screenplay revision',
      requiredRoleKeys: ['director'],
      minApprovals: 1,
    });
    assert.equal(scriptPolicy.policyType, 'screenplay_draft');
    assert.equal(scriptPolicy.minApprovals, 1);

    // =========================================================================
    // 2. Multi-Stage Approval Request & Voting
    // =========================================================================
    process.stdout.write('Test 2: Multi-stage approval request and quorum decision...\n');
    const budgetReq = await repo.createApprovalRequest(
      {
        filmId: filmKalki,
        policyId: budgetPolicy.id,
        targetType: 'budget',
        targetId: budgetId,
        title: 'కల్కి 2 ప్రొడక్షన్ బడ్జెట్ v1.0 ఆమోదం',
        summary: 'రూ. 400 కోట్ల బడ్జెట్ మరియు VFX షెడ్యూల్ కేటాయింపులు',
      },
      producerUser,
    );
    assert.equal(budgetReq.status, 'pending');

    // First Approver: Producer votes 'approved'
    const step1 = await repo.recordApprovalDecision(
      {
        filmId: filmKalki,
        requestId: budgetReq.id,
        decision: 'approved',
        feedback: 'నిర్మాత వైపు నుంచి ఆర్థిక ప్రణాళిక ఆమోదించబడింది.',
        signature: 'C. Aswani Dutt [Digital Signature]',
      },
      producerUser,
    );
    assert.equal(step1.request.status, 'pending', 'Status remains pending when min_approvals = 2');
    assert.equal(step1.decisions.length, 1);

    // Second Approver: Director votes 'approved'
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [directorUser]);
    const step2 = await repo.recordApprovalDecision(
      {
        filmId: filmKalki,
        requestId: budgetReq.id,
        decision: 'approved',
        feedback: 'క్రియేటివ్ మరియు ప్రొడక్షన్ ఖర్చులు సరిగ్గా ఉన్నాయి.',
        signature: 'Nag Ashwin [Creative Lock]',
      },
      directorUser,
    );
    assert.equal(step2.request.status, 'approved', 'Status transitions to approved on reaching quorum');
    assert.ok(step2.request.decidedAt);
    assert.equal(step2.decisions.length, 2);

    // =========================================================================
    // 3. Approval Rejection & Veto Handling
    // =========================================================================
    process.stdout.write('Test 3: Rejection and veto in approval chain...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [producerUser]);
    const scriptReq = await repo.createApprovalRequest(
      {
        filmId: filmKalki,
        policyId: scriptPolicy.id,
        targetType: 'document',
        targetId: scriptDocId,
        title: 'స్క్రిప్ట్ డ్రాఫ్ట్ 3 ఆమోద అభ్యర్థన',
        summary: 'క్లైమాక్స్ సన్నివేశంలో మార్పులు',
      },
      producerUser,
    );

    // Director rejects
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [directorUser]);
    const rejectedResult = await repo.recordApprovalDecision(
      {
        filmId: filmKalki,
        requestId: scriptReq.id,
        decision: 'rejected',
        feedback: 'క్లైమాక్స్ సంభాషణల్లో మరింత స్పష్టత మరియు భావోద్వేగం అవసరం.',
      },
      directorUser,
    );
    assert.equal(rejectedResult.request.status, 'rejected');
    assert.ok(rejectedResult.request.decidedAt);

    // =========================================================================
    // 4. Ownership Transfer Lifecycle
    // =========================================================================
    process.stdout.write('Test 4: Film ownership transfer lifecycle...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [producerUser]);
    const tokenHash = randomBytes(32);

    const transfer = await repo.initiateOwnershipTransfer(
      {
        filmId: filmKalki,
        targetOwnerUserId: directorUser,
        reason: 'ప్రొడక్షన్ పగ్గాలు మరియు పూర్తి నిర్ణయాధికారం దర్శకుడికి బదిలీ',
        expiryHours: 72,
      },
      producerUser,
      tokenHash,
    );

    assert.equal(transfer.filmId, filmKalki);
    assert.equal(transfer.currentOwnerUserId, producerUser);
    assert.equal(transfer.targetOwnerUserId, directorUser);
    assert.equal(transfer.status, 'initiated');

    // Target user accepts ownership transfer
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [directorUser]);
    const accepted = await repo.acceptOwnershipTransfer(transfer.id, directorUser);
    assert.equal(accepted, true);

    // =========================================================================
    // 5. Super Admin Break-Glass Operational Access
    // =========================================================================
    process.stdout.write('Test 5: Super Admin audited break-glass operational access...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [adminUser]);

    const breakGlass = await repo.startBreakGlassSession(
      {
        targetFilmId: filmKalki,
        reason: 'Customer-reported sync partition incident investigation under ticket INC-84920',
        ticketReference: 'INC-84920',
        sessionDurationMinutes: 120,
      },
      adminUser,
      randomBytes(32),
    );

    assert.equal(breakGlass.adminUserId, adminUser);
    assert.equal(breakGlass.targetFilmId, filmKalki);
    assert.equal(breakGlass.status, 'active');
    assert.equal(breakGlass.ticketReference, 'INC-84920');

    // Close break glass
    const closed = await repo.closeBreakGlassSession(breakGlass.id, adminUser);
    assert.equal(closed, true);

    // =========================================================================
    // 6. Retention Policies & Lifecycle Requests (Owner Export / Archive / Delete)
    // =========================================================================
    process.stdout.write('Test 6: Retention policy and lifecycle export request...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [directorUser]);

    const retention = await repo.upsertRetentionPolicy({
      filmId: filmKalki,
      retentionPeriodDays: 730,
      autoPurgeDeletedItems: true,
      purgeDelayDays: 14,
    });
    assert.equal(retention.retentionPeriodDays, 730);
    assert.equal(retention.purgeDelayDays, 14);

    const lifecycleReq = await repo.createLifecycleRequest(
      {
        filmId: filmKalki,
        requestType: 'export_archive',
        exportManifest: {
          includeScreenplays: true,
          includeBudgets: true,
          includeSchedules: true,
          format: 'zip',
        },
      },
      directorUser,
    );
    assert.equal(lifecycleReq.status, 'requested');
    assert.equal(lifecycleReq.requestType, 'export_archive');

    const completedLifecycle = await repo.completeLifecycleRequest(lifecycleReq.id, {
      archiveUrl: 'https://storage.internal/archives/kalki-seq-export-20261115.zip',
      fileSizeCents: 419430400,
    });
    assert.ok(completedLifecycle);
    assert.equal(completedLifecycle.status, 'completed');
    assert.ok(completedLifecycle.completedAt);

    // =========================================================================
    // 7. Strict Multi-Tenant & RLS Isolation
    // =========================================================================
    process.stdout.write('Test 7: Strict multi-tenant isolation against rival user...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [rivalUser]);

    const rivalPolicy = await repo.getApprovalPolicy(filmKalki, 'production_budget');
    assert.equal(rivalPolicy, null, 'Rival cannot view another film approval policy');

    const rivalReq = await repo.getApprovalRequest(budgetReq.id);
    assert.equal(rivalReq, null, 'Rival cannot view another film approval request');

    await pool.end();
    await database.close();

    process.stdout.write('✅ All 7 Film Administration & Approvals checks PASSED successfully!\n');
  } catch (error) {
    process.stderr.write(`❌ Film administration & approvals test failed: ${error}\n`);
    await database.close();
    process.exit(1);
  }
}

main();
