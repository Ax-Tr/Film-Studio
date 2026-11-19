import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import * as path from 'node:path';
import * as fs from 'node:fs';

@Injectable()
export class DatabasePoolService implements OnApplicationShutdown {
  readonly pool: Pool;
  private readonly pgliteDb?: PGlite;

  constructor(connectionString: string) {
    if (connectionString.startsWith('postgresql://embedded') || connectionString.startsWith('postgresql://pglite')) {
      const defaultDir = fs.existsSync(path.resolve(process.cwd(), 'backend'))
        ? path.resolve(process.cwd(), 'backend/data/pglite')
        : path.resolve(process.cwd(), 'data/pglite');
      const dataDir = process.env.PGLITE_DATA_DIR ? path.resolve(process.env.PGLITE_DATA_DIR) : defaultDir;
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.pgliteDb = new PGlite(dataDir);
      this.pool = new Pool(createPgConfig(this.pgliteDb));
    } else {
      const useSsl =
        connectionString.includes('sslmode=require') ||
        connectionString.includes('supabase.co') ||
        connectionString.includes('pooler.supabase.com');
      const rejectUnauthorized =
        process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
      const effectiveConnectionString = rejectUnauthorized
        ? connectionString
        : connectionString.replace(/([?&])sslmode=[^&]*/gu, '$1sslmode=no-verify');

      this.pool = new Pool({
        connectionString: effectiveConnectionString,
        application_name: 'film-studio-api',
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...(useSsl ? { ssl: { rejectUnauthorized } } : {}),
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    if (this.pgliteDb) {
      await this.pgliteDb.close();
    }
  }
}
