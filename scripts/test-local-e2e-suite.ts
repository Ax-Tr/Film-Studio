import assert from 'node:assert/strict';

const BACKEND_URL = 'http://127.0.0.1:4000';
const FRONTEND_URL = 'http://127.0.0.1:3600';
const SESSION_TOKEN = 'local-studio-session-token-1234567890';
const FILM_ID = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const DOC_ID = '018f4ce4-c111-75c9-8d26-424bb512c0cf';

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

interface TestStep {
  name: string;
  fn: () => Promise<void>;
}

const steps: TestStep[] = [
  {
    name: '1. Backend Health Check (/health)',
    fn: async () => {
      const res = await fetch(`${BACKEND_URL}/health`);
      assert.equal(res.status, 200, 'Health check should return 200');
      const data = (await res.json()) as { status: string; service: string };
      assert.equal(data.status, 'ok', 'Status should be ok');
      assert.equal(data.service, 'api', 'Service should be api');
      log(`   ✓ Health probe passed: ${data.service} ${data.status}`);
    },
  },
  {
    name: '2. Backend Database Readiness (/ready)',
    fn: async () => {
      const res = await fetch(`${BACKEND_URL}/ready`);
      assert.equal(res.status, 200, 'Readiness should return 200');
      const data = (await res.json()) as { status: string; database: boolean };
      assert.equal(data.status, 'ok', 'Readiness status should be ok');
      assert.equal(data.database, true, 'Database should be true');
      log('   ✓ Database readiness probe passed: DB connected');
    },
  },
  {
    name: '3. Authentication & Principal Context (/v1/me/session)',
    fn: async () => {
      const res = await fetch(`${BACKEND_URL}/v1/me/session`, {
        headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
      });
      assert.equal(res.status, 200, 'Session check should return 200');
      const data = (await res.json()) as { userId: string; sessionId: string };
      assert.ok(data.userId, 'Should return userId');
      assert.ok(data.sessionId, 'Should return sessionId');
      log(`   ✓ Authenticated principal verified: ${data.userId}`);
    },
  },
  {
    name: '4. Accessible Films Listing with Telugu NFC (/v1/films)',
    fn: async () => {
      const res = await fetch(`${BACKEND_URL}/v1/films`, {
        headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
      });
      assert.equal(res.status, 200, 'List films should return 200');
      const films = (await res.json()) as Array<{ id: string; title: string }>;
      assert.ok(Array.isArray(films), 'Films should be an array');
      assert.ok(films.length > 0, 'Should have at least 1 film');
      const target = films.find((f) => f.id === FILM_ID);
      assert.ok(target, 'Seeded film should exist');
      assert.ok(target.title.includes('రుద్రవీణ'), 'Title should contain Telugu string');
      assert.equal(target.title, target.title.normalize('NFC'), 'Title should be canonical NFC');
      log(`   ✓ Film found: "${target.title}" (NFC verified)`);
    },
  },
  {
    name: '5. Screenplay Document Hierarchy (/v1/films/:id/documents)',
    fn: async () => {
      const res = await fetch(`${BACKEND_URL}/v1/films/${FILM_ID}/documents`, {
        headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
      });
      assert.equal(res.status, 200, 'List documents should return 200');
      const docs = (await res.json()) as Array<{ id: string; title: string; kind: string; language: string }>;
      assert.ok(Array.isArray(docs), 'Documents should be an array');
      const doc = docs.find((d) => d.id === DOC_ID);
      assert.ok(doc, 'Seeded doc should exist');
      assert.equal(doc.kind, 'screenplay', 'Doc kind should be screenplay');
      assert.equal(doc.language, 'te', 'Doc language should be Telugu');
      log(`   ✓ Screenplay doc verified: "${doc.title}" [${doc.language}]`);
    },
  },
  {
    name: '6. Character Creation & Voice Profile (/v1/films/:id/characters)',
    fn: async () => {
      const newChar = {
        displayName: 'లక్ష్మీపతి (Lakshmipathi)',
        profile: {
          voice: 'Wise elder villager, speaking in rustic Godavari Telugu dialect',
          arc: 'Traditional elder finding harmony with youth',
        },
      };
      const res = await fetch(`${BACKEND_URL}/v1/films/${FILM_ID}/characters`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newChar),
      });
      assert.equal(res.status, 201, 'Create character should return 201');
      const created = (await res.json()) as { id: string; displayName: string };
      assert.ok(created.id, 'Created character should have ID');
      assert.equal(created.displayName, newChar.displayName);
      assert.equal(created.displayName, created.displayName.normalize('NFC'));
      log(`   ✓ Telugu character created: "${created.displayName}"`);

      // Verify character retrieval
      const getRes = await fetch(
        `${BACKEND_URL}/v1/films/${FILM_ID}/characters/${created.id}`,
        { headers: { Authorization: `Bearer ${SESSION_TOKEN}` } },
      );
      assert.equal(getRes.status, 200, 'Get character should return 200');
      const fetched = (await getRes.json()) as { id: string };
      assert.equal(fetched.id, created.id);
      log('   ✓ Character retrieval verified');
    },
  },
  {
    name: '7. Character Graph & Relationships (/characters/:id/relationships)',
    fn: async () => {
      const listRes = await fetch(`${BACKEND_URL}/v1/films/${FILM_ID}/characters`, {
        headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
      });
      const chars = (await listRes.json()) as Array<{ id: string }>;
      assert.ok(chars.length >= 2, 'Should have at least 2 characters');
      const charA = chars[0].id;
      const charB = chars[1].id;

      const relRes = await fetch(
        `${BACKEND_URL}/v1/films/${FILM_ID}/characters/${charA}/relationships`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SESSION_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetCharacterId: charB,
            relationshipType: 'mentor',
            description: 'Carnatic musical master and disciple relationship',
          }),
        },
      );
      assert.equal(relRes.status, 201, 'Create relationship should return 201');
      const rel = (await relRes.json()) as { sourceCharacterId: string; targetCharacterId: string; relationshipType: string };
      assert.equal(rel.sourceCharacterId, charA);
      assert.equal(rel.targetCharacterId, charB);
      assert.equal(rel.relationshipType, 'mentor');
      log('   ✓ Character relationship created: mentor -> disciple');
    },
  },
  {
    name: '8. Multilingual Indic Search (/v1/films/:id/search)',
    fn: async () => {
      const res = await fetch(
        `${BACKEND_URL}/v1/films/${FILM_ID}/search?query=${encodeURIComponent('గణపతి')}`,
        { headers: { Authorization: `Bearer ${SESSION_TOKEN}` } },
      );
      assert.equal(res.status, 200, 'Search should return 200');
      const search = (await res.json()) as { results: unknown[] };
      assert.ok(Array.isArray(search.results), 'Results should be an array');
      log(`   ✓ Indic search succeeded: ${search.results.length} results returned`);
    },
  },
  {
    name: '9. Frontend Reverse Proxy Rewrites (:3600 -> :4000)',
    fn: async () => {
      const res = await fetch(`${FRONTEND_URL}/films`, {
        headers: { Cookie: `film_access=${SESSION_TOKEN}` },
      });
      assert.equal(res.status, 200, 'Frontend rewrite to /films should return 200');
      const films = (await res.json()) as unknown[];
      assert.ok(Array.isArray(films), 'Rewritten response should be array');
      assert.ok(films.length > 0, 'Rewritten response should have films');
      log('   ✓ Frontend reverse proxy rewrite verified');
    },
  },
  {
    name: '10. Frontend SSR & Hydration Pages (:3600)',
    fn: async () => {
      const pages = [
        { path: '/', expectedText: 'తెలుగు' },
        { path: '/support', expectedText: '<!DOCTYPE html>' },
        { path: `/films/${FILM_ID}`, expectedText: '<!DOCTYPE html>' },
        { path: `/films/${FILM_ID}/characters`, expectedText: '<!DOCTYPE html>' },
        { path: `/films/${FILM_ID}/documents/${DOC_ID}`, expectedText: '<!DOCTYPE html>' },
        { path: `/films/${FILM_ID}/search`, expectedText: '<!DOCTYPE html>' },
      ];

      for (const p of pages) {
        const res = await fetch(`${FRONTEND_URL}${p.path}`, {
          headers: { Cookie: `film_access=${SESSION_TOKEN}` },
        });
        assert.equal(res.status, 200, `Page ${p.path} should return 200`);
        const html = await res.text();
        assert.ok(html.includes(p.expectedText), `Page ${p.path} should contain "${p.expectedText}"`);
        log(`   ✓ Page rendered 200 OK: ${p.path} (${html.length} bytes)`);
      }
    },
  },
];

async function run(): Promise<void> {
  log('================================================================');
  log('  FILM STUDIO LOCAL FULL FEATURE TEST SUITE');
  log(`  Backend:  ${BACKEND_URL}`);
  log(`  Frontend: ${FRONTEND_URL}`);
  log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const step of steps) {
    log(`\n▶ Running: ${step.name}`);
    try {
      await step.fn();
      passed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`   ✗ FAILED: ${message}\n`);
      if (err instanceof Error && err.stack) {
        process.stderr.write(`${err.stack}\n`);
      }
      failed++;
    }
  }

  log('\n================================================================');
  log(`  TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

void run();
