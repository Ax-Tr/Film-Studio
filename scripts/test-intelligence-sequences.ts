import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresIntelligenceRepository } from '../backend/src/database/postgres-intelligence.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const docOne = '018f4ce4-c111-7000-8000-000000000001';
const charOne = '018f4ce4-d111-7000-8000-000000000001';
const charTwo = '018f4ce4-d222-7000-8000-000000000002';
const sceneOne = '018f4ce4-e111-7000-8000-000000000001';
const sceneTwo = '018f4ce4-e222-7000-8000-000000000002';
const sceneThree = '018f4ce4-e333-7000-8000-000000000003';
const sceneFour = '018f4ce4-e444-7000-8000-000000000004';

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
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Intelligence Epic');
      SELECT app_security.create_film('${filmTwo}', '${organizationOne}', 'Isolated Film');

      -- Insert Screenplay Document
      INSERT INTO documents (id, film_id, title, kind, language, created_by)
      VALUES ('${docOne}', '${filmOne}', 'Main Screenplay', 'screenplay', 'te-IN', '${userOne}');

      -- Insert Characters
      INSERT INTO characters (id, film_id, display_name)
      VALUES
        ('${charOne}', '${filmOne}', 'దేవా (Deva)'),
        ('${charTwo}', '${filmOne}', 'వరద (Varadha)');

      -- Insert Scenes
      INSERT INTO scenes (id, film_id, document_id, slugline)
      VALUES
        ('${sceneOne}', '${filmOne}', '${docOne}', 'EXT. KHANSAAR BORDER - DAWN'),
        ('${sceneTwo}', '${filmOne}', '${docOne}', 'INT. ARMORY - DAY'),
        ('${sceneThree}', '${filmOne}', '${docOne}', 'EXT. PALACE COURTYARD - NIGHT'),
        ('${sceneFour}', '${filmOne}', '${docOne}', 'INT. THRONE ROOM - NIGHT');

      -- Insert Dialogue Appearances for Pacing / Dialogue Share
      INSERT INTO scene_character_appearances (film_id, document_id, scene_id, character_id, dialogue_block_count, dialogue_word_count)
      VALUES
        ('${filmOne}', '${docOne}', '${sceneOne}', '${charOne}', 4, 150),
        ('${filmOne}', '${docOne}', '${sceneTwo}', '${charOne}', 6, 250),
        ('${filmOne}', '${docOne}', '${sceneTwo}', '${charTwo}', 8, 300),
        ('${filmOne}', '${docOne}', '${sceneThree}', '${charTwo}', 5, 200);
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresIntelligenceRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Sequence Creation and Ordering
      const seq1 = await repo.createSequence(
        {
          filmId: filmOne,
          documentId: docOne,
          title: 'Sequence A: ప్రతిజ్ఞ (The Vow)',
          dramaticPurpose: 'Establish lifelong friendship and sacred oath under crisis',
          act: 1,
        },
        client
      );
      assert.equal(seq1.act, 1);
      assert.equal(seq1.sortOrder, 1000);
      assert.ok(seq1.title.includes('ప్రతిజ్ఞ'));

      const seq2 = await repo.createSequence(
        {
          filmId: filmOne,
          documentId: docOne,
          title: 'Sequence B: సామ్రాజ్య పోరు (Empire Conflict)',
          dramaticPurpose: 'Power struggle reaches fever pitch across warlords',
          act: 2,
        },
        client
      );
      assert.equal(seq2.act, 2);

      const seqList = await repo.listSequences(filmOne, docOne, client);
      assert.equal(seqList.length, 2);
      assert.equal(seqList[0]?.id, seq1.id);
      assert.equal(seqList[1]?.id, seq2.id);

      // 2. Scene Intelligence Updates
      await repo.updateSceneIntelligence(
        filmOne,
        docOne,
        {
          sceneId: sceneOne,
          sequenceId: seq1.id,
          dramaticPurpose: 'Hero steps in to protect friend against overwhelming odds',
          tone: 'Gritty, Tense',
          emotionalPolarity: 'positive',
          sceneStatus: 'locked',
          tags: ['border', 'action', 'oath'],
          notes: 'High speed tracking shot with Telugu dialogue clarity',
        },
        client
      );

      await repo.updateSceneIntelligence(
        filmOne,
        docOne,
        {
          sceneId: sceneTwo,
          sequenceId: seq2.id,
          dramaticPurpose: 'Conspiracy unveiled, impending invasion confirmed',
          tone: 'Dark, Suspenseful',
          emotionalPolarity: 'negative',
          sceneStatus: 'revised',
          tags: ['armory', 'strategy'],
        },
        client
      );

      // 3. Character Arc Management
      const initialArc = await repo.getCharacterArc(filmOne, charOne, client);
      assert.equal(initialArc, null, 'Character arc initially null');

      const savedArc = await repo.upsertCharacterArc(
        filmOne,
        {
          characterId: charOne,
          startingState: 'Exiled blacksmith living peaceful life in anonymity',
          transformationCatalyst: 'Childhood friend summons the ancient vow',
          climaxChoice: 'Sacrifice personal tranquility to defend realm',
          resolutionState: 'Crown protector and legend among the people',
          flaw: 'Relentless fury when provoked',
          internalNeed: 'Inner peace and reconciliation with past violence',
          externalGoal: 'Protect Varadha and dismantle corrupt council',
          dialectProfile: 'Northern Rayalaseema Telugu dialect with cadence',
          voiceRhythm: 'Deep, measured, bursts into commanding cadence under threat',
          vocabularyNotes: 'Ancient proverbs, direct declarative verbs',
        },
        client
      );
      assert.equal(savedArc.characterId, charOne);
      assert.ok(savedArc.dialectProfile?.includes('Rayalaseema'));
      assert.ok(savedArc.transformationCatalyst?.includes('ancient vow'));

      // 4. Pacing and Analytics Generation
      const pacingReport = await repo.generatePacingReport(filmOne, docOne, client);
      assert.equal(pacingReport.filmId, filmOne);
      assert.equal(pacingReport.totalScenes, 4);
      assert.equal(pacingReport.totalSequences, 2);

      // Verify Act Breakdown
      assert.ok(pacingReport.actBreakdown['Act 1']);
      assert.ok(pacingReport.actBreakdown['Act 2']);
      assert.ok(pacingReport.actBreakdown['Act 3']);
      assert.equal(pacingReport.actBreakdown['Act 1']?.sequences[0], seq1.title);
      assert.equal(pacingReport.actBreakdown['Act 2']?.sequences[0], seq2.title);

      // Total words: Deva (150+250 = 400), Varadha (300+200 = 500), Total = 900
      assert.equal(pacingReport.characterDialogueShare.length, 2);
      const varadhaShare = pacingReport.characterDialogueShare.find((c) => c.characterId === charTwo);
      const devaShare = pacingReport.characterDialogueShare.find((c) => c.characterId === charOne);
      assert.ok(varadhaShare && devaShare);
      assert.equal(varadhaShare.dialogueWords, 500);
      assert.equal(devaShare.dialogueWords, 400);
      assert.ok(varadhaShare.percentage > 55);
      assert.ok(devaShare.percentage > 44);

      // 5. Tenant Isolation Verification
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderSeqList = await repo.listSequences(filmOne, docOne, client);
      assert.equal(intruderSeqList.length, 0, 'Intruder cannot read sequences from another film');

      const intruderArc = await repo.getCharacterArc(filmOne, charOne, client);
      assert.equal(intruderArc, null, 'Intruder cannot read character arcs from another film');

      const intruderPacing = await repo.generatePacingReport(filmOne, docOne, client);
      assert.equal(intruderPacing.totalScenes, 0, 'Intruder cannot get pacing stats of another film');
      assert.equal(intruderPacing.characterDialogueShare.length, 0);

      process.stdout.write('Sprint 23 Sequence, Character & Scene Intelligence verified successfully.\n');
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
