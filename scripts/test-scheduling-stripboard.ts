import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresSchedulingRepository } from '../apps/api/src/database/postgres-scheduling.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-a999-79aa-94a6-09195b7d9999';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const documentOne = '018f4ce4-d100-7000-8000-000000000001';
const sceneOne = '018f4ce4-e300-7000-8000-000000000001';
const sceneTwo = '018f4ce4-e300-7000-8000-000000000002';

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
        ('${userOne}', '1st AD (Assistant Director)', 'ad@studio.test'),
        ('${userTwo}', 'Rival AD', 'rival@studio.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'SSMB29 Globe Trotter');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Isolated Production');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Isolated Film');
    `);

    await database.exec(`
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by)
      VALUES ('${documentOne}', '${filmOne}', 'ఆఫ్రికన్ అడవుల వేట', 'screenplay', 'te-IN', '${userOne}');

      INSERT INTO scenes (id, film_id, document_id, slugline) VALUES
        ('${sceneOne}', '${filmOne}', '${documentOne}', 'EXT. AMAZON RIVER - SUNSET'),
        ('${sceneTwo}', '${filmOne}', '${documentOne}', 'INT. ANCIENT TEMPLE - NIGHT');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresSchedulingRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Create Shooting Schedule with Telugu title and auto-versioning
      const scheduleTitle = 'షెడ్యూల్ 1: అమెజాన్ & నైలు బ్లాక్ (Phase 1)';
      const scheduleNotes = 'విదేశీ లొకేషన్లలో మొదటి దశ చిత్రీకరణ';

      const schedule = await repo.createSchedule(
        {
          filmId: filmOne,
          title: scheduleTitle,
          startDate: '2026-12-01',
          endDate: '2026-12-20',
          estimatedShootDays: 18,
          notes: scheduleNotes,
        },
        userOne,
        client,
      );

      assert.equal(schedule.title, scheduleTitle);
      assert.equal(schedule.versionNumber, 1);
      assert.equal(schedule.status, 'draft');
      assert.equal(schedule.startDate, '2026-12-01');
      assert.equal(schedule.estimatedShootDays, 18);
      process.stdout.write('  ✓ Shooting schedule created with Telugu title and auto-versioning\n');

      // 2. Create Shoot Days
      const day1 = await repo.createShootDay(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          dayNumber: 1,
          calendarDate: '2026-12-01',
          title: 'డే 1 - రివర్ ఛేజ్ మరియు పడవల పోరాటం',
          callTime: '05:30:00',
          wrapTime: '18:00:00',
          primaryLocation: 'Amazon Riverbank Pier 4',
          notes: 'Special speedboat safety crew required on site by 05:00',
        },
        client,
      );

      const day2 = await repo.createShootDay(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          dayNumber: 2,
          calendarDate: '2026-12-02',
          title: 'డే 2 - పురాతన ఆలయ అంతర్భాగం',
          callTime: '16:00:00',
          wrapTime: '04:00:00',
          primaryLocation: 'Ancient Stone Temple Set',
          notes: 'Night shoot. Torchlight practical lighting rigs ready',
        },
        client,
      );

      assert.equal(day1.dayNumber, 1);
      assert.equal(day2.dayNumber, 2);
      process.stdout.write('  ✓ Shoot days created with call/wrap times and locations\n');

      // 3. Create Stripboard Strips
      const day1Banner = await repo.createStrip(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          stripType: 'day_banner',
          shootDayId: day1.id,
          stripOrder: 0,
          description: 'DAY 1 - TUESDAY, DEC 1, 2026 (4 2/8 PGS)',
        },
        client,
      );

      const scene1Strip = await repo.createStrip(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          stripType: 'scene',
          sceneId: sceneOne,
          shootDayId: day1.id,
          stripOrder: 1,
          pageEighths: 18,
          estimatedMinutes: 240,
          intExt: 'EXT',
          dayNight: 'DUSK',
          locationText: 'AMAZON RIVER',
          description: 'Boat chase climax before sunset',
          castIds: ['HERO_LEAD', 'VILLAIN_PIRATE'],
        },
        client,
      );

      const day2Banner = await repo.createStrip(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          stripType: 'day_banner',
          shootDayId: day2.id,
          stripOrder: 2,
          description: 'DAY 2 - WEDNESDAY, DEC 2, 2026 (3 4/8 PGS)',
        },
        client,
      );

      const scene2Strip = await repo.createStrip(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          stripType: 'scene',
          sceneId: sceneTwo,
          shootDayId: day2.id,
          stripOrder: 3,
          pageEighths: 28,
          estimatedMinutes: 300,
          intExt: 'INT',
          dayNight: 'NIGHT',
          locationText: 'ANCIENT TEMPLE',
          description: 'Artifact discovery and confrontation',
          castIds: ['HERO_LEAD', 'ARCHAEOLOGIST'],
        },
        client,
      );

      assert.equal(day1Banner.stripType, 'day_banner');
      assert.equal(scene1Strip.stripType, 'scene');
      assert.equal(scene1Strip.intExt, 'EXT');
      assert.equal(scene1Strip.dayNight, 'DUSK');
      assert.equal(day2Banner.stripOrder, 2);
      assert.equal(scene2Strip.stripOrder, 3);
      process.stdout.write('  ✓ Stripboard strips created (banners and scene strips)\n');

      // 4. Reorder Strips (Move scene 2 before scene 1 for optimal company move)
      await repo.reorderStrips(
        schedule.id,
        filmOne,
        [
          { stripId: day1Banner.id, newOrder: 0 },
          { stripId: scene2Strip.id, newOrder: 1 }, // Swapped
          { stripId: day2Banner.id, newOrder: 2 },
          { stripId: scene1Strip.id, newOrder: 3 }, // Swapped
        ],
        client,
      );

      const reorderedStrips = await repo.listStrips(schedule.id, filmOne, client);
      assert.equal(reorderedStrips[1].id, scene2Strip.id);
      assert.equal(reorderedStrips[3].id, scene1Strip.id);
      process.stdout.write('  ✓ Stripboard strip reordering verified\n');

      // 5. Constraints (Actor blackout window)
      const actorConstraint = await repo.createConstraint(
        {
          filmId: filmOne,
          constraintType: 'actor_blackout',
          name: 'Lead Actor Prior Commitment / International Awards',
          startDate: '2026-12-05',
          endDate: '2026-12-08',
          severity: 'hard',
          explanation: 'Lead actor in Tokyo for international promotional commitments',
          isActive: true,
        },
        client,
      );

      const constraints = await repo.listConstraints(filmOne, client);
      assert.equal(constraints.length, 1);
      assert.equal(constraints[0].id, actorConstraint.id);
      process.stdout.write('  ✓ Availability constraint recorded\n');

      // 6. Record Conflict and Manual Override with Reason
      const conflict = await repo.recordConflict(
        {
          filmId: filmOne,
          scheduleId: schedule.id,
          stripId: scene1Strip.id,
          constraintId: actorConstraint.id,
          conflictType: 'actor_unavailable',
          description: 'Lead actor is scheduled on date overlapping with award tour blackout',
          severity: 'critical',
          proposedResolution: 'Shift Scene 1 riverboat chase to Dec 1-2 prior to departure',
        },
        client,
      );

      assert.equal(conflict.isOverridden, false);

      const overriddenConflict = await repo.overrideConflict(
        conflict.id,
        filmOne,
        userOne,
        'Director and Producer confirmed body double will perform distant speedboat stunts during blackout window',
        client,
      );

      assert.equal(overriddenConflict.isOverridden, true);
      assert.equal(overriddenConflict.overriddenBy, userOne);
      assert.ok(overriddenConflict.overrideReason?.includes('body double'));
      process.stdout.write('  ✓ Conflict recording and documented manual override verified\n');

      // 7. Approve Shooting Schedule
      const approvedSchedule = await repo.approveSchedule(
        schedule.id,
        filmOne,
        userOne,
        client,
      );
      assert.equal(approvedSchedule.status, 'approved');
      assert.equal(approvedSchedule.approvedBy, userOne);
      assert.ok(approvedSchedule.approvedAt !== null);
      process.stdout.write('  ✓ Schedule approval lifecycle verified\n');

      // 8. Full Board Query
      const fullBoard = await repo.getFullBoard(schedule.id, filmOne, client);
      assert.ok(fullBoard !== null);
      assert.equal(fullBoard.schedule.id, schedule.id);
      assert.equal(fullBoard.schedule.status, 'approved');
      assert.equal(fullBoard.days.length, 2);
      assert.equal(fullBoard.strips.length, 4);
      assert.equal(fullBoard.conflicts.length, 1);
      process.stdout.write('  ✓ Full stripboard board assembly query verified\n');

      // 9. Multi-tenant RLS Isolation
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderSchedules = await repo.listSchedules(filmOne, client);
      assert.equal(intruderSchedules.length, 0, 'Intruder sees 0 schedules');

      const intruderBoard = await repo.getFullBoard(schedule.id, filmOne, client);
      assert.equal(intruderBoard, null, 'Intruder cannot retrieve full board');

      const intruderConstraints = await repo.listConstraints(filmOne, client);
      assert.equal(intruderConstraints.length, 0, 'Intruder sees 0 constraints');

      process.stdout.write('  ✓ Multi-tenant RLS isolation verified for schedules, strips, and constraints\n');

      process.stdout.write('Sprint 29 Scheduling & Stripboard verified successfully.\n');
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
