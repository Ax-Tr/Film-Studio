import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';

interface AppliedMigration {
  name: string;
  checksum: string;
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }
  const migrationDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../infra/database/migrations',
  );
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();

  let pgliteDb: PGlite | undefined;
  let pool: Pool;

  if (
    connectionString.startsWith('postgresql://embedded') ||
    connectionString.startsWith('postgresql://pglite')
  ) {
    const defaultDir = existsSync(resolve(process.cwd(), 'backend'))
      ? resolve(process.cwd(), 'backend/data/pglite')
      : resolve(process.cwd(), 'data/pglite');
    const dataDir = process.env.PGLITE_DATA_DIR
      ? resolve(process.env.PGLITE_DATA_DIR)
      : defaultDir;
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    pgliteDb = new PGlite(dataDir);
    pool = new Pool(createPgConfig(pgliteDb));
  } else {
    const useSsl =
      connectionString.includes('sslmode=require') ||
      connectionString.includes('supabase.co') ||
      connectionString.includes('pooler.supabase.com');
    const rejectUnauthorized =
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
    pool = new Pool({
      connectionString,
      max: 1,
      ...(useSsl ? { ssl: { rejectUnauthorized } } : {}),
    });
  }

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [7_142_334_901]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL CHECK (length(checksum) = 64),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<AppliedMigration>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
    );
    const appliedByName = new Map(
      applied.rows.map((migration) => [migration.name, migration.checksum]),
    );

    for (const name of names) {
      const sql = await readFile(resolve(migrationDirectory, name), 'utf8');
      const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
      const previousChecksum = appliedByName.get(name);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== checksum) {
          throw new Error(`Applied migration checksum changed: ${name}`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      process.stdout.write(`Applied ${name}\n`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [7_142_334_901]);
    client.release();
    await pool.end();
    if (pgliteDb) {
      await pgliteDb.close();
    }
  }
}

void run();
