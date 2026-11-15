import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresAiFilmDevRepository } from '../apps/api/src/database/postgres-ai-film-dev.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-a999-79aa-94a6-09195b7d9999';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const documentOne = '018f4ce4-d100-7000-8000-000000000001';
const sceneOne = '018f4ce4-e300-7000-8000-000000000001';

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

    // Seed users, orgs, films, documents, scenes
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${userOne}', 'Studio Director', 'director@studio.test'),
        ('${userTwo}', 'Rival Director', 'rival@studio.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Devara Part 1');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Isolated Rival');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Isolated Film');
    `);

    await database.exec(`
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by)
      VALUES ('${documentOne}', '${filmOne}', 'దేవర స్క్రిప్ట్', 'screenplay', 'te-IN', '${userOne}');

      INSERT INTO scenes (id, film_id, document_id, slugline)
      VALUES ('${sceneOne}', '${filmOne}', '${documentOne}', 'EXT. COASTAL CLIFF - NIGHT');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresAiFilmDevRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Create AI Coverage Report with Telugu NFC text
      const teluguLogline = 'సముద్రపు తీరంలో సాగే రక్తపాతం మరియు ఒక నాయకుడి త్యాగం';
      const teluguSynopsis = 'ఎర్ర సముద్రపు తీర గ్రామంలో దేవర అనే నాయకుడు తన ప్రజల రక్షణ కోసం ప్రాణాలను పణంగా పెడతాడు.';

      const coverageReport = await repo.createCoverageReport(
        {
          filmId: filmOne,
          documentId: documentOne,
          analystUserId: userOne,
          modelProvenance: {
            provider: 'gemini',
            modelName: 'gemini-1.5-pro',
            promptVersion: 'v2.1-coverage',
            generatedAt: new Date().toISOString(),
          },
          logline: teluguLogline,
          synopsis: teluguSynopsis,
          premiseRating: 8.5,
          characterRating: 9.0,
          dialogueRating: 8.0,
          pacingRating: 7.5,
          commercialViabilityRating: 9.5,
          overallRecommendation: 'recommend',
          strengths: [
            'Exceptional coastal mythology and atmosphere',
            'Strong heroic conflict with moral ambiguity',
            'Authentic coastal Telugu dialect and vocabulary',
          ],
          weaknesses: [
            'Second act pacing lags during political exposition',
            'Secondary antagonist needs stronger catalyst',
          ],
          sceneCitations: [
            {
              sceneId: sceneOne,
              slugline: 'EXT. COASTAL CLIFF - NIGHT',
              note: 'Pivotal dramatic confrontation establishes tone and stakes',
              citationType: 'dramatic_climax',
            },
          ],
          harmEvalStatus: 'passed',
          language: 'te-IN',
        },
        client,
      );

      assert.equal(coverageReport.filmId, filmOne);
      assert.equal(coverageReport.overallRecommendation, 'recommend');
      assert.equal(coverageReport.commercialViabilityRating, 9.5);
      assert.equal(coverageReport.logline, teluguLogline);
      assert.equal(coverageReport.sceneCitations.length, 1);
      assert.equal(coverageReport.sceneCitations[0].sceneId, sceneOne);
      assert.equal(coverageReport.humanReviewStatus, 'unreviewed');
      process.stdout.write('  ✓ AI Coverage report created with Telugu NFC content and scene citations\n');

      // 2. Human Review on Coverage Report
      const reviewedCoverage = await repo.reviewCoverageReport(
        coverageReport.id,
        filmOne,
        userOne,
        {
          humanReviewStatus: 'accepted',
          humanReviewNotes: 'Director accepts coverage findings; Act II notes forwarded to writers room.',
        },
        client,
      );
      assert.equal(reviewedCoverage.humanReviewStatus, 'accepted');
      assert.equal(reviewedCoverage.humanReviewerId, userOne);
      assert.ok(reviewedCoverage.humanReviewNotes?.includes('Act II notes'));
      process.stdout.write('  ✓ Coverage human review workflow completed\n');

      // 3. Create AI Pitch Package
      const pitchTitle = 'దేవర: ది కోస్టల్ వారియర్';
      const pitchLogline = 'సముద్రపు తీరాన్ని కాపాడే వీరుడి ప్రయాణం';

      const pitchPackage = await repo.createPitchPackage(
        {
          filmId: filmOne,
          title: pitchTitle,
          logline: pitchLogline,
          toneAndGenre: 'Action Drama / Coastal Myth / Epic',
          targetAudience: 'Pan-Indian commercial theatrical audience, 18-45',
          comparableFilms: ['RRR', 'Kantara', 'Baahubali'],
          characterBreakdowns: [
            {
              name: 'దేవర',
              arcSummary: 'Guardian of the coast driven by an unyielding moral code',
              castingPrototype: 'Mass Action Hero / Intense Lead',
              commercialHook: 'Dual role heroic lineage mystery',
            },
            {
              name: 'భైరా',
              arcSummary: 'Ruthless smuggler seeking control over the sea trade',
              castingPrototype: 'Intimidating Veteran Antagonist',
              commercialHook: 'High stakes ideological clash with lead',
            },
          ],
          actSummaries: [
            {
              actNumber: 1,
              summary: 'Establishment of the four coastal villages and the contraband trade pact.',
              keyHooks: ['Underwater action sequence', 'Moral division between leaders'],
            },
            {
              actNumber: 2,
              summary: 'Devara disappears; fear of his phantom presence controls the coast.',
              keyHooks: ['Psychological tension', 'Village rebellion'],
            },
            {
              actNumber: 3,
              summary: 'Truth behind the legend revealed; epic resolution on the cliffs.',
              keyHooks: ['Climactic duel', 'Emotional sacrifice'],
            },
          ],
          visualPaletteNotes: 'Deep ocean blues, dark craggy volcanic rocks, crimson-lit lanterns, turbulent seas.',
          budgetTier: 'tentpole',
          modelProvenance: {
            provider: 'gemini',
            modelName: 'gemini-1.5-pro',
            promptVersion: 'v1.0-pitch-deck',
            generatedAt: new Date().toISOString(),
          },
          citations: [
            { type: 'scene_reference', sceneId: sceneOne, relevance: 'Anchor for visual tone' },
          ],
          language: 'te-IN',
        },
        client,
      );

      assert.equal(pitchPackage.title, pitchTitle);
      assert.equal(pitchPackage.budgetTier, 'tentpole');
      assert.equal(pitchPackage.characterBreakdowns.length, 2);
      assert.equal(pitchPackage.actSummaries.length, 3);
      assert.equal(pitchPackage.comparableFilms.length, 3);
      assert.equal(pitchPackage.humanReviewStatus, 'draft');
      process.stdout.write('  ✓ AI Pitch Package created with character breakdowns, act summaries & budget tiering\n');

      // 4. Human Review & Approval on Pitch Package
      const approvedPitch = await repo.reviewPitchPackage(
        pitchPackage.id,
        filmOne,
        userOne,
        {
          humanReviewStatus: 'director_approved',
        },
        client,
      );
      assert.equal(approvedPitch.humanReviewStatus, 'director_approved');
      assert.equal(approvedPitch.reviewedBy, userOne);
      process.stdout.write('  ✓ Pitch Package human review transition to director_approved\n');

      // 5. Query lists
      const coverageList = await repo.listCoverageReports(filmOne, client);
      assert.equal(coverageList.length, 1);
      assert.equal(coverageList[0].id, coverageReport.id);

      const pitchList = await repo.listPitchPackages(filmOne, client);
      assert.equal(pitchList.length, 1);
      assert.equal(pitchList[0].id, pitchPackage.id);
      process.stdout.write('  ✓ Film lists for coverage and pitch packages verified\n');

      // 6. Multi-tenant RLS Isolation
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderCoverage = await repo.listCoverageReports(filmOne, client);
      assert.equal(intruderCoverage.length, 0, 'Intruder sees 0 coverage reports from filmOne');

      const intruderPitches = await repo.listPitchPackages(filmOne, client);
      assert.equal(intruderPitches.length, 0, 'Intruder sees 0 pitch packages from filmOne');

      const intruderSingleCoverage = await repo.getCoverageReport(coverageReport.id, filmOne, client);
      assert.equal(intruderSingleCoverage, null, 'Intruder cannot retrieve single report');

      process.stdout.write('  ✓ Multi-tenant RLS isolation verified for coverage and pitch packages\n');

      process.stdout.write('Sprint 27 AI Film Development & Pitches verified successfully.\n');
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
