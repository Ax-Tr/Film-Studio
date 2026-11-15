import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

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
    '../../../../infra/database/migrations',
  );
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  const pool = new Pool({ connectionString, max: 1 });
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
  }
}

void run();
