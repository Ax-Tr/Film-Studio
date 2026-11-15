import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresBreakdownRepository } from '../apps/api/src/database/postgres-breakdown.repository.js';

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
        ('${userOne}', 'Line Producer', 'producer@studio.test'),
        ('${userTwo}', 'Rival Line Producer', 'rival@studio.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Pushpa 2: The Rule');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Isolated Production');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Isolated Film');
    `);

    await database.exec(`
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by)
      VALUES ('${documentOne}', '${filmOne}', 'పుష్ప 2 పూర్తి స్క్రిప్ట్', 'screenplay', 'te-IN', '${userOne}');

      INSERT INTO scenes (id, film_id, document_id, slugline)
      VALUES ('${sceneOne}', '${filmOne}', '${documentOne}', 'EXT. SESHATALAM FOREST - DAY');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresBreakdownRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Create Production Elements with Telugu text (NFC Unicode)
      const heroPropName = 'ఎర్ర చందనం దుంగలు (A-Grade Sandalwood)';
      const heroVehicleName = 'పుష్ప రాజ్ కస్టమ్ జీప్ (Modified 4x4)';
      const heroLocationName = 'శేషాచలం దట్టమైన అడవి (Deep Forest Clearing)';

      const propElement = await repo.createProductionElement(
        {
          filmId: filmOne,
          category: 'props',
          name: heroPropName,
          elementCode: 'PROP-001',
          description: 'Custom marked high-density red sandalwood logs for action set piece',
          estimatedCostCents: 250000, // INR 2,500.00 equivalent
          isApproved: true,
        },
        userOne,
        client,
      );

      const vehicleElement = await repo.createProductionElement(
        {
          filmId: filmOne,
          category: 'vehicles',
          name: heroVehicleName,
          elementCode: 'VEH-001',
          description: 'Weathered open-top forest terrain vehicle with heavy winch',
          estimatedCostCents: 1500000,
          isApproved: true,
        },
        userOne,
        client,
      );

      const locationElement = await repo.createProductionElement(
        {
          filmId: filmOne,
          category: 'location',
          name: heroLocationName,
          elementCode: 'LOC-001',
          description: 'Natural canopy with filtered light and steep rocky inclines',
          estimatedCostCents: 500000,
          isApproved: true,
        },
        userOne,
        client,
      );

      assert.equal(propElement.name, heroPropName);
      assert.equal(propElement.category, 'props');
      assert.equal(propElement.isApproved, true);
      assert.equal(vehicleElement.category, 'vehicles');
      assert.equal(locationElement.category, 'location');
      process.stdout.write('  ✓ Production elements created across categories with Telugu NFC names\n');

      // 2. Query and list production elements
      const elementsList = await repo.listProductionElements(filmOne, undefined, client);
      assert.equal(elementsList.length, 3);

      const propsOnly = await repo.listProductionElements(filmOne, 'props', client);
      assert.equal(propsOnly.length, 1);
      assert.equal(propsOnly[0].id, propElement.id);
      process.stdout.write('  ✓ Category filtering on production elements verified\n');

      // 3. Upsert Scene Breakdown Sheet (1/8th page timings)
      const breakdownSheet = await repo.upsertSceneBreakdownSheet(
        {
          filmId: filmOne,
          sceneId: sceneOne,
          pageEighths: 24, // 3 full pages (24/8)
          estimatedShootMinutes: 240, // 4 hours
          dramaticDay: 'D1',
          scriptDay: 'Day 1',
          synopsis: 'పుష్ప మరియు పోలీసుల మధ్య అడవిలో భారీ ఎదురుకాల్పులు',
          setupNotes: 'Crane setup on south ridge, rain rig on stand-by',
          status: 'draft',
        },
        client,
      );

      assert.equal(breakdownSheet.pageEighths, 24);
      assert.equal(breakdownSheet.estimatedShootMinutes, 240);
      assert.equal(breakdownSheet.dramaticDay, 'D1');
      assert.equal(breakdownSheet.status, 'draft');
      process.stdout.write('  ✓ Scene breakdown sheet created with page 1/8ths and timings\n');

      // 4. Link Production Elements into Scene Breakdown
      const propItem = await repo.addBreakdownItem(
        {
          filmId: filmOne,
          breakdownSheetId: breakdownSheet.id,
          elementId: propElement.id,
          quantity: 20,
          isRequired: true,
          notes: 'Arranged in stack behind the truck cabin',
          sourceOrigin: 'script_extracted',
          evidenceText: 'Twenty heavy red sandalwood logs are loaded onto the carrier.',
          userAmended: false,
        },
        client,
      );

      const vehicleItem = await repo.addBreakdownItem(
        {
          filmId: filmOne,
          breakdownSheetId: breakdownSheet.id,
          elementId: vehicleElement.id,
          quantity: 1,
          isRequired: true,
          notes: 'Driver door removed for stunt exit',
          sourceOrigin: 'manual',
          evidenceText: 'Pushpa accelerates his jeep straight through the barrier.',
          userAmended: false,
        },
        client,
      );

      assert.equal(propItem.quantity, 20);
      assert.equal(propItem.sourceOrigin, 'script_extracted');
      assert.equal(propItem.userAmended, false);
      assert.equal(vehicleItem.quantity, 1);
      assert.equal(vehicleItem.sourceOrigin, 'manual');
      process.stdout.write('  ✓ Elements linked to scene sheet with evidence quotes\n');

      // 5. User Edit Protection: Extraction changes never silently overwrite user edits
      const updatedPropItem = await repo.updateBreakdownItem(
        propItem.id,
        filmOne,
        {
          quantity: 25, // Line producer increases to 25 logs
          notes: 'Line producer confirmed 25 logs needed for camera coverage',
          userAmended: true, // Marked user amended!
        },
        client,
      );

      assert.equal(updatedPropItem.quantity, 25);
      assert.equal(updatedPropItem.userAmended, true, 'User edit protection flag active');
      process.stdout.write('  ✓ User edit protection flag (user_amended) verified\n');

      // 6. Query Full Breakdown Sheet (with joined element fields)
      const fullSheet = await repo.getSceneBreakdownSheet(filmOne, sceneOne, client);
      assert.ok(fullSheet !== null);
      assert.equal(fullSheet.sheet.id, breakdownSheet.id);
      assert.equal(fullSheet.items.length, 2);

      const joinedProp = fullSheet.items.find((i) => i.elementId === propElement.id);
      assert.ok(joinedProp !== undefined);
      assert.equal(joinedProp.elementName, heroPropName);
      assert.equal(joinedProp.elementCategory, 'props');
      assert.equal(joinedProp.elementCode, 'PROP-001');
      assert.equal(joinedProp.quantity, 25);
      assert.equal(joinedProp.userAmended, true);
      process.stdout.write('  ✓ Full breakdown sheet query with joined element metadata verified\n');

      // 7. Lock Breakdown Sheet
      const lockedSheet = await repo.lockSceneBreakdownSheet(
        breakdownSheet.id,
        filmOne,
        userOne,
        client,
      );
      assert.equal(lockedSheet.status, 'locked');
      assert.equal(lockedSheet.lockedBy, userOne);
      assert.ok(lockedSheet.lockedAt !== null);
      process.stdout.write('  ✓ Scene breakdown sheet locked with user and timestamp\n');

      // 8. Multi-tenant RLS Isolation
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderElements = await repo.listProductionElements(filmOne, undefined, client);
      assert.equal(intruderElements.length, 0, 'Intruder sees 0 production elements');

      const intruderSheets = await repo.listBreakdownSheets(filmOne, client);
      assert.equal(intruderSheets.length, 0, 'Intruder sees 0 breakdown sheets');

      const intruderFullSheet = await repo.getSceneBreakdownSheet(filmOne, sceneOne, client);
      assert.equal(intruderFullSheet, null, 'Intruder cannot retrieve breakdown sheet');

      process.stdout.write('  ✓ Multi-tenant RLS isolation verified for breakdown elements and sheets\n');

      process.stdout.write('Sprint 28 Production Breakdown verified successfully.\n');
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
