import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresContinuityRepository } from '../backend/src/database/postgres-continuity.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const docOne = '018f4ce4-c111-7000-8000-000000000001';
const charOne = '018f4ce4-d111-7000-8000-000000000001';
const sceneOne = '018f4ce4-e111-7000-8000-000000000001';
const sceneTwo = '018f4ce4-e222-7000-8000-000000000002';

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
        ('${userOne}', 'Director One', 'director@example.test'),
        ('${userTwo}', 'Intruder Two', 'intruder@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Studio Org');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Continuity Epic');
      SELECT app_security.create_film('${filmTwo}', '${organizationOne}', 'Isolated Film');

      -- Insert Screenplay Document
      INSERT INTO documents (id, film_id, title, kind, language, created_by)
      VALUES ('${docOne}', '${filmOne}', 'Production Script', 'screenplay', 'te-IN', '${userOne}');

      -- Insert Character
      INSERT INTO characters (id, film_id, display_name)
      VALUES ('${charOne}', '${filmOne}', 'విక్రమార్క (Vikramarka)');

      -- Insert Scenes
      INSERT INTO scenes (id, film_id, document_id, slugline)
      VALUES
        ('${sceneOne}', '${filmOne}', '${docOne}', 'INT. POLICE HEADQUARTERS - DAY'),
        ('${sceneTwo}', '${filmOne}', '${docOne}', 'EXT. HIGHWAY CHECKPOST - NIGHT');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresContinuityRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Continuity Facts Creation and Query
      const fact1 = await repo.createContinuityFact(
        {
          filmId: filmOne,
          entityType: 'character',
          entityId: charOne,
          attributeKey: 'left_arm_tattoo',
          canonicalValue: 'సింహం చిహ్నం (Lion Sigil)',
          evidenceSceneId: sceneOne,
          notes: 'Established in Scene 1 during uniform inspection',
        },
        client
      );
      assert.equal(fact1.filmId, filmOne);
      assert.equal(fact1.entityType, 'character');
      assert.ok(fact1.canonicalValue.includes('సింహం చిహ్నం'));

      const fact2 = await repo.createContinuityFact(
        {
          filmId: filmOne,
          entityType: 'prop',
          attributeKey: 'service_weapon',
          canonicalValue: 'Glock 19 (Serial #VK-9021)',
          evidenceSceneId: sceneOne,
          notes: 'Standard issued sidearm',
        },
        client
      );

      const factsList = await repo.listContinuityFacts(filmOne, client);
      assert.equal(factsList.length, 2);
      assert.equal(factsList[0]?.attributeKey, 'left_arm_tattoo');
      assert.equal(factsList[1]?.attributeKey, 'service_weapon');

      // 2. Continuity Issue Lifecycle (Potential -> Intentional Exception -> Resolved)
      const issue1 = await repo.createContinuityIssue(
        {
          filmId: filmOne,
          documentId: docOne,
          factId: fact1.id,
          sceneId: sceneTwo,
          ruleCode: 'TATTOO_VISIBILITY_CONFLICT',
          severity: 'warning',
          status: 'potential',
          explanation: 'Scene 2 description states clean bare forearms without the lion sigil tattoo',
        },
        client
      );
      assert.equal(issue1.status, 'potential');
      assert.equal(issue1.severity, 'warning');

      // Mark as intentional exception
      const exceptionIssue = await repo.resolveContinuityIssue(
        filmOne,
        issue1.id,
        {
          status: 'intentional_exception',
          resolutionNotes: 'Director approved: Character covered tattoo with makeup for undercover operation',
          resolvedBy: userOne,
        },
        client
      );
      assert.equal(exceptionIssue.status, 'intentional_exception');
      assert.ok(exceptionIssue.resolutionNotes?.includes('undercover operation'));

      // Create a second issue and resolve it
      const issue2 = await repo.createContinuityIssue(
        {
          filmId: filmOne,
          documentId: docOne,
          factId: fact2.id,
          sceneId: sceneTwo,
          ruleCode: 'WEAPON_PROP_MISMATCH',
          severity: 'critical',
          status: 'confirmed',
          explanation: 'Character draws a revolver despite canonical sidearm being Glock 19',
        },
        client
      );
      assert.equal(issue2.status, 'confirmed');

      const resolvedIssue = await repo.resolveContinuityIssue(
        filmOne,
        issue2.id,
        {
          status: 'resolved',
          resolutionNotes: 'Script edited: Character now draws backup revolver from boot holster',
          resolvedBy: userOne,
        },
        client
      );
      assert.equal(resolvedIssue.status, 'resolved');
      assert.ok(resolvedIssue.resolvedAt);

      const issuesList = await repo.listContinuityIssues(filmOne, docOne, client);
      assert.equal(issuesList.length, 2);

      // 3. Production Revisions & Colored Drafts
      const whiteDraft = await repo.createProductionRevision(
        {
          filmId: filmOne,
          documentId: docOne,
          revisionNumber: 1,
          color: 'white',
          title: 'White (First Production Draft)',
          createdBy: userOne,
        },
        client
      );
      assert.equal(whiteDraft.revisionNumber, 1);
      assert.equal(whiteDraft.color, 'white');
      assert.equal(whiteDraft.isLocked, false);

      // Lock White Draft
      const lockedWhite = await repo.lockProductionRevision(filmOne, whiteDraft.id, userOne, client);
      assert.equal(lockedWhite.isLocked, true);
      assert.equal(lockedWhite.lockedBy, userOne);
      assert.ok(lockedWhite.lockedAt);

      // Create Blue Revision (Draft 2)
      const blueRevision = await repo.createProductionRevision(
        {
          filmId: filmOne,
          documentId: docOne,
          color: 'blue',
          title: 'Blue Revision (Location Changes)',
          createdBy: userOne,
        },
        client
      );
      assert.equal(blueRevision.revisionNumber, 2);
      assert.equal(blueRevision.color, 'blue');

      const allRevisions = await repo.listProductionRevisions(filmOne, docOne, client);
      assert.equal(allRevisions.length, 2);
      assert.equal(allRevisions[0]?.color, 'white');
      assert.equal(allRevisions[1]?.color, 'blue');

      // 4. Formal Revision Approval Workflow
      const approval1 = await repo.submitRevisionApproval(
        filmOne,
        blueRevision.id,
        userOne,
        'approved',
        'Approved by Lead Director for production shooting script distribution',
        client
      );
      assert.equal(approval1.status, 'approved');
      assert.ok(approval1.comments?.includes('Lead Director'));
      assert.ok(approval1.decisionAt);

      const approvalsList = await repo.listRevisionApprovals(filmOne, blueRevision.id, client);
      assert.equal(approvalsList.length, 1);
      assert.equal(approvalsList[0]?.status, 'approved');

      // 5. Tenant Isolation Verification
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderFacts = await repo.listContinuityFacts(filmOne, client);
      assert.equal(intruderFacts.length, 0, 'Intruder cannot access continuity facts of another film');

      const intruderIssues = await repo.listContinuityIssues(filmOne, docOne, client);
      assert.equal(intruderIssues.length, 0, 'Intruder cannot access continuity issues of another film');

      const intruderRevisions = await repo.listProductionRevisions(filmOne, docOne, client);
      assert.equal(intruderRevisions.length, 0, 'Intruder cannot access production revisions of another film');

      const intruderApprovals = await repo.listRevisionApprovals(filmOne, blueRevision.id, client);
      assert.equal(intruderApprovals.length, 0, 'Intruder cannot access revision approvals of another film');

      process.stdout.write('Sprint 24 Continuity & Revision Control verified successfully.\n');
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
