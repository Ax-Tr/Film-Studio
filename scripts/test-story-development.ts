import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresStoryRepository } from '../apps/api/src/database/postgres-story.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
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
        ('${userOne}', 'Director One', 'director@example.test'),
        ('${userTwo}', 'Intruder Two', 'intruder@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Studio Org');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Telugu Epic Project');
      SELECT app_security.create_film('${filmTwo}', '${organizationOne}', 'Isolated Second Film');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresStoryRepository(pool);

    const client = await pool.connect();
    try {
      // 1. Test Story Bible Creation & Retrieval
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      const initialBible = await repo.getStoryBible(filmOne, client);
      assert.equal(initialBible, null, 'Story bible initially null');

      const savedBible = await repo.upsertStoryBible(
        filmOne,
        {
          premise: 'సామాన్యుడు సామ్రాజ్యాధినేతగా మారే కథ',
          theme: 'ధర్మం మరియు త్యాగం (Dharma & Sacrifice)',
          dramaticQuestion: 'నాయకుడు తన కుటుంబాన్ని కాపాడగలడా లేదా రాజ్యాన్ని కాపాడగలడా?',
          narrativeStructure: 'three_act',
          logline: 'An honest warrior must choose between family honor and realm survival.',
          shortSynopsis: 'వివరమైన కథా సారాంశం',
          worldBuildingRules: { era: '16th Century', magic: false },
        },
        client
      );

      assert.equal(savedBible.filmId, filmOne);
      assert.equal(savedBible.narrativeStructure, 'three_act');
      assert.ok(savedBible.premise?.includes('సామాన్యుడు'));
      assert.ok(savedBible.theme?.includes('Dharma'));

      // 2. Test Story Threads (Plotlines)
      const threadA = await repo.createThread(
        {
          filmId: filmOne,
          title: 'A-Plot: సామ్రాజ్య రక్షణ (Kingdom Defense)',
          colorHex: '#f3b74f',
          threadType: 'plot',
          description: 'Main conflict against invading army',
          sortOrder: 1,
        },
        client
      );
      assert.equal(threadA.filmId, filmOne);
      assert.equal(threadA.threadType, 'plot');

      const threadB = await repo.createThread(
        {
          filmId: filmOne,
          title: 'B-Plot: గురు-శిష్య సంబంధం (Mentor-Student Arc)',
          colorHex: '#38bdf8',
          threadType: 'character_arc',
          sortOrder: 2,
        },
        client
      );
      assert.equal(threadB.threadType, 'character_arc');

      const threads = await repo.listThreads(filmOne, client);
      assert.equal(threads.length, 2);
      assert.equal(threads[0]?.title, 'A-Plot: సామ్రాజ్య రక్షణ (Kingdom Defense)');

      // 3. Test Story Beats (Save The Cat / Three Act Structure Beats)
      const beat1 = await repo.createBeat(
        {
          filmId: filmOne,
          threadId: threadA.id,
          act: 1,
          title: 'ఆరంభం (Opening Image / Inciting Incident)',
          beatType: 'inciting_incident',
          timingMinute: 12,
          description: 'శాంతియుత గ్రామంపై దాడి జరుగుతుంది',
          sortOrder: 1,
        },
        client
      );
      assert.equal(beat1.act, 1);
      assert.equal(beat1.timingMinute, 12);
      assert.equal(beat1.threadId, threadA.id);

      const beat2 = await repo.createBeat(
        {
          filmId: filmOne,
          threadId: threadB.id,
          act: 2,
          title: 'మధ్య బిందువు (Midpoint Revelation)',
          beatType: 'midpoint',
          timingMinute: 60,
          description: 'నిజమైన శత్రువు ఎవరో తెలుస్తుంది',
          sortOrder: 1,
        },
        client
      );
      assert.equal(beat2.act, 2);

      const beats = await repo.listBeats(filmIdOneWrap(filmOne), client);
      assert.equal(beats.length, 2);

      // 4. Test Story Development Studio Overview
      const overview = await repo.getDevelopmentOverview(filmOne, client);
      assert.ok(overview.bible);
      assert.equal(overview.threads.length, 2);
      assert.equal(overview.beats.length, 2);

      // 5. Tenant Isolation & Row-Level Security
      // Switch context to filmTwo (which userTwo or userOne has no story data for)
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);
      const isolatedBible = await repo.getStoryBible(filmTwo, client);
      assert.equal(isolatedBible, null, 'FilmTwo must see null story bible');
      const isolatedThreads = await repo.listThreads(filmTwo, client);
      assert.equal(isolatedThreads.length, 0, 'FilmTwo must see 0 threads');

      // Unauthorized user context
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);
      const intruderThreads = await repo.listThreads(filmOne, client);
      assert.equal(intruderThreads.length, 0, 'Uninvited user must not access filmOne story threads');
    } finally {
      client.release();
      await pool.end();
    }
  } finally {
    await database.close();
  }
}

function filmIdOneWrap(id: string) {
  return id;
}

void main();

