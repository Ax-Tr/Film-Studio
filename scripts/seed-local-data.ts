import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

export const LOCAL_DEV_TOKEN = 'local-studio-session-token-1234567890';
export const LOCAL_USER_ID = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
export const LOCAL_ORG_ID = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
export const LOCAL_FILM_ID = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
export const LOCAL_DOC_ID = '018f4ce4-c111-75c9-8d26-424bb512c0cf';
export const LOCAL_DEVICE_ID = '018f4ce4-7a86-7f2e-96df-bf4e914f21d5';

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export async function seedLocalDatabase(dataDir = 'backend/data/pglite') {
  log(`[Seed] Connecting to PGlite at ${dataDir}...`);
  const db = new PGlite(dataDir);

  try {
    // 1. Ensure schema_migrations table
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL CHECK (length(checksum) = 64),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Record any unrecorded migrations
    const migrationDir = resolve(process.cwd(), 'infra/database/migrations');
    const migrationFiles = (await readdir(migrationDir))
      .filter((n) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(n))
      .sort();

    const appliedRes = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    const appliedSet = new Set(appliedRes.rows.map((r) => r.name));

    for (const file of migrationFiles) {
      if (!appliedSet.has(file)) {
        const sql = await readFile(resolve(migrationDir, file), 'utf8');
        const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
        await db.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [file, checksum],
        );
      }
    }
    log('[Seed] All 19 migration manifests synced.');

    // 2. Insert User
    await db.query(
      `
      INSERT INTO users (id, display_name, primary_email, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
      `,
      [LOCAL_USER_ID, 'ఎస్. ఎస్. రాజమౌళి (Director)', 'director@filmstudio.local'],
    );

    // 3. Insert Device
    await db.query(
      `
      INSERT INTO devices (id, user_id, platform, label, status)
      VALUES ($1, $2, 'web', 'Studio Workstation (Local)', 'active')
      ON CONFLICT (user_id, id) DO NOTHING
      `,
      [LOCAL_DEVICE_ID, LOCAL_USER_ID],
    );

    // 4. Insert Active Session
    const accessHash = hashToken(LOCAL_DEV_TOKEN);
    const refreshHash = hashToken(`${LOCAL_DEV_TOKEN}-refresh`);
    const accessExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const refreshExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await db.query(
      `
      INSERT INTO sessions (
        id, family_id, user_id, device_id,
        access_token_hash, refresh_token_hash,
        access_expires_at, refresh_expires_at,
        authenticated_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      ON CONFLICT (access_token_hash) DO NOTHING
      `,
      [
        randomUUID(),
        randomUUID(),
        LOCAL_USER_ID,
        LOCAL_DEVICE_ID,
        accessHash,
        refreshHash,
        accessExpires,
        refreshExpires,
      ],
    );
    log('[Seed] Dev user, device, and session seeded.');

    // Set RLS user context
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [LOCAL_USER_ID]);

    // 5. Create Organization & Film via app_security functions
    const orgExists = await db.query('SELECT id FROM organizations WHERE id = $1', [LOCAL_ORG_ID]);
    if (orgExists.rows.length === 0) {
      await db.query(`SELECT app_security.create_organization($1, $2)`, [
        LOCAL_ORG_ID,
        'వైజయంతి మూవీస్ (Vyjayanthi Movies)',
      ]);
    } else {
      await db.query(
        `
        INSERT INTO organization_memberships (organization_id, user_id, role, status)
        VALUES ($1, $2, 'owner', 'active')
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active'
        `,
        [LOCAL_ORG_ID, LOCAL_USER_ID],
      );
    }

    const filmExists = await db.query('SELECT id FROM films WHERE id = $1', [LOCAL_FILM_ID]);
    if (filmExists.rows.length === 0) {
      await db.query(`SELECT app_security.create_film($1, $2, $3)`, [
        LOCAL_FILM_ID,
        LOCAL_ORG_ID,
        'రుద్రవీణ (Rudraveena)',
      ]);
    } else {
      await db.query(
        `
        INSERT INTO film_memberships (film_id, user_id, status, joined_at)
        VALUES ($1, $2, 'active', now())
        ON CONFLICT (film_id, user_id) DO UPDATE SET status = 'active'
        `,
        [LOCAL_FILM_ID, LOCAL_USER_ID],
      );
    }

    // Grant all permissions to local user for the film
    const allPerms = await db.query<{ key: string }>('SELECT key FROM permissions');
    for (const { key } of allPerms.rows) {
      await db.query(
        `
        INSERT INTO membership_permission_overrides (film_id, user_id, permission_key, effect, reason, granted_by)
        VALUES ($1, $2, $3, 'allow', 'Local development superuser', $2)
        ON CONFLICT (film_id, user_id, permission_key) DO UPDATE SET effect = 'allow'
        `,
        [LOCAL_FILM_ID, LOCAL_USER_ID, key],
      );
    }
    log('[Seed] Organization, film, and permissions seeded.');

    // 7. Create Screenplay Document
    await db.query(
      `
      INSERT INTO documents (id, film_id, title, kind, language, version, created_by)
      VALUES ($1, $2, $3, 'screenplay', 'te', 1, $4)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
      `,
      [LOCAL_DOC_ID, LOCAL_FILM_ID, 'రుద్రవీణ - డ్రాఫ్ట్ 1 (Draft 1)', LOCAL_USER_ID],
    );

    // 8. Create Characters
    const chars = [
      {
        id: '018f4ce4-e001-75c9-8d26-424bb512c0cf',
        name: 'సూర్యం (Suryam)',
        profile: { voice: 'Idealistic young musician with rebellious energy', arc: 'Rebellion to leadership' },
      },
      {
        id: '018f4ce4-e002-75c9-8d26-424bb512c0cf',
        name: 'బిలహరి గణపతి (Bilahari Ganapathi)',
        profile: { voice: 'Stern classical carnatic purist, uncompromising master', arc: 'Orthodoxy to reconciliation' },
      },
      {
        id: '018f4ce4-e003-75c9-8d26-424bb512c0cf',
        name: 'లలిత (Lalitha)',
        profile: { voice: 'Compassionate dancer, emotional grounding for Suryam', arc: 'Support to empowerment' },
      },
    ];

    for (const c of chars) {
      await db.query(
        `
        INSERT INTO characters (id, film_id, display_name, profile)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, profile = EXCLUDED.profile
        `,
        [c.id, LOCAL_FILM_ID, c.name, JSON.stringify(c.profile)],
      );
    }
    log('[Seed] Characters seeded.');

    log('[Seed] Database initialization complete!');
    log(`[Seed] Dev token: ${LOCAL_DEV_TOKEN}`);
    log(`[Seed] Film ID:   ${LOCAL_FILM_ID}`);
    log(`[Seed] Doc ID:    ${LOCAL_DOC_ID}`);
  } finally {
    await db.close();
  }
}

if (process.argv[1]?.endsWith('seed-local-data.ts')) {
  seedLocalDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed Error]', err);
      process.exit(1);
    });
}
