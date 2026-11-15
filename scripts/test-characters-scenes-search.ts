import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresCharacterRepository } from '../apps/api/src/database/postgres-character.repository.js';
import { CharacterService } from '../apps/api/src/modules/content/character.service.js';
import type { MutationContext } from '../apps/api/src/database/postgres-tenant.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const documentOne = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const sceneOne = '018f4ce4-d16a-78b4-b2b1-85ec72e26323';
const sceneTwo = '018f4ce4-d16a-78b4-b2b1-85ec72e26324';
const sessionOne = '018f4ce4-e001-7000-8000-000000000001';

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
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Deva Katta Project');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO documents (id, film_id, title, kind, language, created_by, version)
      VALUES ('${documentOne}', '${filmOne}', 'Autonagar Surya Script', 'screenplay', 'te-IN', '${userOne}', 1);

      INSERT INTO scenes (id, film_id, document_id, version, slugline, summary)
      VALUES
        ('${sceneOne}', '${filmOne}', '${documentOne}', 1, 'EXT. CHARMINAR - NIGHT', 'Surya confronts the syndicate.'),
        ('${sceneTwo}', '${filmOne}', '${documentOne}', 1, 'INT. WAREHOUSE - DAY', 'Planning the defense.');

      INSERT INTO document_scene_order (film_id, document_id, scene_id, position)
      VALUES
        ('${filmOne}', '${documentOne}', '${sceneOne}', 0),
        ('${filmOne}', '${documentOne}', '${sceneTwo}', 1);

      INSERT INTO role_permissions (role_id, permission_key)
      SELECT role.id, 'film.documents.edit'
      FROM roles role WHERE role.film_id = '${filmOne}' AND role.name = 'Film Owner'
      ON CONFLICT DO NOTHING;
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresCharacterRepository(pool);

    const mockPermissions = {
      requireFilmPermission: async (_u: string, _s: string, fId: string) => {
        if (fId !== filmOne) throw new Error('PERMISSION_DENIED');
        return Promise.resolve();
      },
      checkFilmPermission: async (_u: string, _s: string, fId: string) => fId === filmOne,
    } as unknown as Parameters<typeof CharacterService.prototype.constructor>[1];

    const mockAudit = {
      record: async () => Promise.resolve(),
    } as unknown as Parameters<typeof CharacterService.prototype.constructor>[2];

    const service = new CharacterService(repo, mockPermissions, mockAudit);

    const ctx: MutationContext = {
      userId: userOne,
      sessionId: sessionOne,
      requestId: '018f4ce4-f999-7000-8000-000000000001',
    };

    // 1. Create Characters with Telugu & Latin names
    const charSurya = await service.createCharacter(ctx, filmOne, {
      displayName: 'సూర్య (Surya)',
      aliases: ['Surya', 'బాస్'],
      profile: { archetype: 'protagonist', age: 28 },
      voiceTraits: { tempo: 'fast', tone: 'intense' },
      arcSummary: 'An engineering graduate turned revolutionary mechanic.',
    });
    assert.ok(charSurya.id);
    assert.equal(charSurya.displayName, 'సూర్య (Surya)');
    assert.equal(charSurya.version, 1);

    const charKasi = await service.createCharacter(ctx, filmOne, {
      displayName: 'కాశీ (Kasi)',
      aliases: ['Kasi Bhai', 'కార్యకర్త'],
      profile: { archetype: 'mentor', age: 45 },
      voiceTraits: { tempo: 'measured', tone: 'grounded' },
      arcSummary: 'Senior union organizer guiding Surya.',
    });
    assert.ok(charKasi.id);

    // 2. Add Character Relationship
    const rel = await service.addRelationship(
      ctx,
      filmOne,
      charSurya.id,
      charKasi.id,
      'mentor-mentee',
      'Kasi acts as Surya’s philosophical guide in the union struggles.',
    );
    assert.equal(rel.sourceCharacterId, charSurya.id);
    assert.equal(rel.targetCharacterId, charKasi.id);
    assert.equal(rel.relationshipType, 'mentor-mentee');

    const relationships = await service.listRelationships(ctx, filmOne, charSurya.id);
    assert.equal(relationships.length, 1);
    assert.equal(relationships[0]!.relationshipType, 'mentor-mentee');

    // 3. Record Scene Appearances & Dialogue Projections
    await repo.recordSceneAppearance(
      userOne,
      filmOne,
      documentOne,
      sceneOne,
      charSurya.id,
      5,
      120,
    );
    await repo.recordSceneAppearance(
      userOne,
      filmOne,
      documentOne,
      sceneOne,
      charKasi.id,
      3,
      80,
    );

    // Verify character aggregated counts
    const charSuryaAgg = await service.getCharacter(ctx, filmOne, charSurya.id);
    assert.equal(charSuryaAgg?.totalScenes, 1);
    assert.equal(charSuryaAgg?.totalDialogueBlocks, 5);
    assert.equal(charSuryaAgg?.totalDialogueWords, 120);

    // 4. Query Scene Cards on the board
    const cards = await service.listSceneCards(ctx, filmOne, documentOne);
    assert.equal(cards.length, 2);
    assert.equal(cards[0]!.id, sceneOne);
    assert.equal(cards[0]!.slugline, 'EXT. CHARMINAR - NIGHT');
    assert.equal(cards[0]!.characters.length, 2);
    assert.equal(cards[0]!.wordCount, 200); // 120 + 80
    assert.equal(cards[0]!.isLocked, false);

    // 5. Lock and Unlock Scene
    await service.lockScene(ctx, filmOne, documentOne, sceneOne, true);
    const lockedCards = await service.listSceneCards(ctx, filmOne, documentOne);
    assert.equal(lockedCards[0]!.isLocked, true);
    assert.equal(lockedCards[0]!.lockedBy, userOne);
    assert.ok(lockedCards[0]!.lockedAt);

    await service.lockScene(ctx, filmOne, documentOne, sceneOne, false);
    const unlockedCards = await service.listSceneCards(ctx, filmOne, documentOne);
    assert.equal(unlockedCards[0]!.isLocked, false);
    assert.equal(unlockedCards[0]!.lockedBy, null);

    // 6. Reorder Scenes (sceneTwo first, sceneOne second)
    await service.reorderScenes(ctx, filmOne, documentOne, [sceneTwo, sceneOne]);
    const reorderedCards = await service.listSceneCards(ctx, filmOne, documentOne);
    assert.equal(reorderedCards[0]!.id, sceneTwo);
    assert.equal(reorderedCards[0]!.position, 0);
    assert.equal(reorderedCards[1]!.id, sceneOne);
    assert.equal(reorderedCards[1]!.position, 1);

    // 7. Insert document version and projected screenplay block for search
    const versionOne = '018f4ce4-e001-72f5-bb90-f925b4fa6c58';
    await database.exec(`
      INSERT INTO document_versions (
        id, film_id, document_id, document_version, schema_version, snapshot, snapshot_sha256, created_by
      ) VALUES (
        '${versionOne}',
        '${filmOne}',
        '${documentOne}',
        1,
        1,
        '{}'::jsonb,
        '\\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        '${userOne}'
      );

      INSERT INTO screenplay_block_projections (
        id, film_id, document_id, scene_id, source_document_version_id, position, block_type, text_content
      ) VALUES (
        '018f4ce4-ffff-7000-8000-000000000001',
        '${filmOne}',
        '${documentOne}',
        '${sceneOne}',
        '${versionOne}',
        0,
        'dialogue',
        'మనం చేసే పనిలో నిజాయితీ ఉంటే భయపడాల్సిన పనిలేదు!'
      );
    `);

    // 8. Unicode-aware Search: Search by Telugu Character Name, Alias, and Dialogue
    const charSearch = await service.globalSearch(ctx, filmOne, 'సూర్య');
    assert.ok(charSearch.results.length >= 1);
    assert.equal(charSearch.results[0]!.type, 'character');
    assert.equal(charSearch.results[0]!.title, 'సూర్య (Surya)');

    const aliasSearch = await service.globalSearch(ctx, filmOne, 'బాస్');
    assert.ok(aliasSearch.results.length >= 1);
    assert.equal(aliasSearch.results[0]!.type, 'character');

    const sceneSearch = await service.globalSearch(ctx, filmOne, 'CHARMINAR');
    assert.ok(sceneSearch.results.some((r) => r.type === 'scene' && r.title.includes('CHARMINAR')));

    const dialogueSearch = await service.globalSearch(ctx, filmOne, 'నిజాయితీ');
    assert.ok(dialogueSearch.results.some((r) => r.type === 'dialogue' && r.snippet.includes('నిజాయితీ')));

    // 9. Negative cross-film tenant isolation
    let isolatedDenied = false;
    try {
      await service.listCharacters(ctx, filmTwo);
    } catch {
      isolatedDenied = true;
    }
    assert.ok(isolatedDenied, 'Cross-film access without permissions must be rejected.');

    await pool.end();
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  console.error('❌ Sprint 11 characters/scenes/search test suite failed:', err);
  process.exitCode = 1;
});
