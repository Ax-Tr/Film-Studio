import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { getTranslations, supportedLocales } from '@film-studio/localization';
import { PostgresKnowledgeRepository } from '../backend/src/database/postgres-knowledge.repository.js';

// Users
const authorUser = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4'; // Screenplay Author / Historian
const rivalUser = '018f4ce4-82c4-7808-ae50-28293c570bd5';  // Rival / Intruder

// Orgs and Films
const orgMythri = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const orgRival = '018f4ce4-a888-79aa-94a6-09195b7d8888';
const filmVaranasi = '018f4ce4-b3df-75c9-8d26-424bb512c0cf'; // Varanasi Chronicles
const filmRival = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

// Target Entity
const targetSceneId = '018f4ce4-c111-7000-8000-000000000011';

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
        ('${authorUser}', 'V. Vijayendra Prasad', 'prasad@studio.test'),
        ('${rivalUser}', 'Rival Spy', 'spy@rival.test');

      -- Set Author session to create org & film
      SELECT set_config('app.user_id', '${authorUser}', false);
      SELECT app_security.create_organization('${orgMythri}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmVaranasi}', '${orgMythri}', 'వారణాసి క్షేత్రం (Varanasi Chronicles)');

      -- Set Rival session to create rival org & film
      SELECT set_config('app.user_id', '${rivalUser}', false);
      SELECT app_security.create_organization('${orgRival}', 'Rival Productions');
      SELECT app_security.create_film('${filmRival}', '${orgRival}', 'Rival Film');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresKnowledgeRepository(pool);

    // Switch session to Author
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [authorUser]);

    // =========================================================================
    // 1. Knowledge Asset Creation with Canonical Telugu NFC Text
    // =========================================================================
    process.stdout.write('Test 1: Creating lore asset with Telugu canonical text...\n');
    const asset = await repo.createAsset(
      {
        filmId: filmVaranasi,
        title: 'కాశీ క్షేత్ర పురాణం మరియు గంగా తీర సంప్రదాయాలు',
        category: 'mythology_lore',
        language: 'te-IN',
        contentFormat: 'markdown',
        textContent: `వారణాసి క్షేత్రం శివుని త్రిశూలంపై నిలిచి ఉందని పురాణాల నమ్మకం. గంగా నది ఉత్తరవాహినిగా ప్రవహించే ఈ పవిత్ర తీరంలో జరిగే సాయంత్ర హారతి అత్యంత పుణ్యప్రదమైనది. మణికర్ణికా ఘాట్ అఖండ జ్యోతి నిత్యం వెలుగుతూనే ఉంటుంది.`,
        tags: ['వారణాసి', 'కాశీ', 'శివుడు', 'గంగ', 'హారతి'],
        metadata: { source: 'స్కంద పురాణం - కాశీ ఖండం', verifiedByHistorian: true },
      },
      authorUser,
    );

    assert.equal(asset.filmId, filmVaranasi);
    assert.equal(asset.category, 'mythology_lore');
    assert.ok(asset.title.includes('కాశీ క్షేత్ర పురాణం'));
    assert.equal(asset.tags.length, 5);

    // Create search chunks with high-dimensional embedding simulation
    const dummyEmbedding = Array.from({ length: 8 }, (_, i) => (i + 1) * 0.1);
    const chunk = await repo.createChunk({
      filmId: filmVaranasi,
      assetId: asset.id,
      chunkIndex: 0,
      chunkText: asset.textContent,
      language: 'te-IN',
      embeddingModel: 'text-embedding-004',
      embeddingVector: dummyEmbedding,
    });

    assert.equal(chunk.assetId, asset.id);
    assert.equal(chunk.chunkIndex, 0);
    assert.equal(chunk.embeddingVector?.length, 8);

    // =========================================================================
    // 2. Advanced Telugu Hybrid Search (Semantic & Keyword)
    // =========================================================================
    process.stdout.write('Test 2: Hybrid search across Telugu knowledge chunks...\n');
    const searchResults = await repo.searchKnowledge({
      filmId: filmVaranasi,
      query: 'మణికర్ణికా ఘాట్',
      category: 'mythology_lore',
      limit: 5,
    });

    assert.ok(searchResults.length > 0, 'Hybrid search must return matched lore chunks');
    assert.equal(searchResults[0]?.assetTitle, asset.title);
    assert.ok(searchResults[0]?.similarityScore && searchResults[0].similarityScore >= 0.5);
    assert.ok(searchResults[0]?.matchSnippet.includes('మణికర్ణికా ఘాట్'));

    // =========================================================================
    // 3. Telugu Regional Dialect Terms (Rayalaseema & Telangana)
    // =========================================================================
    process.stdout.write('Test 3: Telugu dialect terms and regional nuance dictionaries...\n');
    const term1 = await repo.createDialectTerm({
      filmId: filmVaranasi,
      standardTerm: 'ఎలా',
      dialectTerm: 'ఎట్లా',
      dialectRegion: 'rayalaseema',
      meaning: 'విధము లేదా పద్ధతి (In what manner / how)',
      exampleDialogue: 'నువ్వు అక్కడికి ఎట్లా పోతావు సామీ?',
    });
    assert.equal(term1.dialectRegion, 'rayalaseema');
    assert.equal(term1.dialectTerm, 'ఎట్లా');

    const term2 = await repo.createDialectTerm({
      filmId: filmVaranasi,
      standardTerm: 'ఇలా',
      dialectTerm: 'గిట్ల',
      dialectRegion: 'telangana',
      meaning: 'ఈ విధంగా (In this manner / like this)',
      exampleDialogue: 'గిట్ల మాట్లాడితే ఎట్లా కుదురుతది బాయ్?',
    });
    assert.equal(term2.dialectRegion, 'telangana');

    const rayalaseemaTerms = await repo.listDialectTerms(filmVaranasi, 'rayalaseema');
    assert.equal(rayalaseemaTerms.length, 1);
    assert.equal(rayalaseemaTerms[0]?.dialectTerm, 'ఎట్లా');

    // =========================================================================
    // 4. Knowledge Asset Reference Linking
    // =========================================================================
    process.stdout.write('Test 4: Linking lore references to production scenes...\n');
    const reference = await repo.createReference({
      filmId: filmVaranasi,
      assetId: asset.id,
      targetType: 'scene',
      targetId: targetSceneId,
      relevanceNotes: 'Scene 1 ghat background details based on Manikarnika lore',
    });

    assert.equal(reference.assetId, asset.id);
    assert.equal(reference.targetType, 'scene');
    assert.equal(reference.targetId, targetSceneId);

    const sceneRefs = await repo.listReferences(filmVaranasi, 'scene', targetSceneId);
    assert.equal(sceneRefs.length, 1);
    assert.equal(sceneRefs[0]?.id, reference.id);

    // =========================================================================
    // 5. Derived Index Deletion Policy
    // =========================================================================
    process.stdout.write('Test 5: Asset deletion removes derived chunks and embeddings per policy...\n');
    const deleted = await repo.deleteAsset(asset.id);
    assert.equal(deleted, true);

    const chunksAfterDelete = await repo.listChunks(asset.id);
    assert.equal(chunksAfterDelete.length, 0, 'Derived search chunks must be cascade deleted');

    const postDeleteSearch = await repo.searchKnowledge({
      filmId: filmVaranasi,
      query: 'మణికర్ణికా',
    });
    assert.equal(postDeleteSearch.length, 0, 'Search index must no longer return deleted asset chunks');

    // =========================================================================
    // 6. Cross-Project Retrieval Leakage Prevention
    // =========================================================================
    process.stdout.write('Test 6: Cross-project retrieval leakage prevention against rival project...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [rivalUser]);

    const rivalSearch = await repo.searchKnowledge({
      filmId: filmVaranasi,
      query: 'గంగా తీరం',
    });
    assert.equal(rivalSearch.length, 0, 'Rival user cannot search knowledge of another film');

    const rivalDialectTerms = await repo.listDialectTerms(filmVaranasi);
    assert.equal(rivalDialectTerms.length, 0, 'Rival user cannot list dialect terms of another film');

    // =========================================================================
    // 7. Multilingual Localization Baseline across 8 Confirmed Languages
    // =========================================================================
    process.stdout.write('Test 7: Multilingual translation validation across 8 confirmed Indic languages...\n');
    assert.equal(supportedLocales.length, 8);

    for (const locale of supportedLocales) {
      const strings = getTranslations(locale);
      assert.ok(strings.app.title, `Missing app.title in locale: ${locale}`);
      assert.ok(strings.editor.sceneNavigator, `Missing sceneNavigator in locale: ${locale}`);
      assert.ok(strings.search.title, `Missing search.title in locale: ${locale}`);
      assert.ok(strings.importExport.exportPdf, `Missing exportPdf in locale: ${locale}`);
    }

    await pool.end();
    await database.close();

    process.stdout.write('✅ All 7 Knowledge & Multilingual Search checks PASSED successfully!\n');
  } catch (error) {
    process.stderr.write(`❌ Knowledge & multilingual search test failed: ${error}\n`);
    await database.close();
    process.exit(1);
  }
}

main();
