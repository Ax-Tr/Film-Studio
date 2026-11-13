import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabasePoolService implements OnApplicationShutdown {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      application_name: 'film-studio-api',
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
