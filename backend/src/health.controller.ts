import { Controller, Get, Optional } from '@nestjs/common';
import type { ReadinessStatusDto, ServiceStatus } from '@film-studio/contracts';
import type { Pool } from 'pg';

@Controller()
export class HealthController {
  constructor(@Optional() private readonly pool?: Pool) {}

  @Get('health')
  getHealth(): ServiceStatus {
    return {
      service: 'api',
      status: 'ok',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReadiness(): Promise<ReadinessStatusDto> {
    let dbOk = true;
    if (this.pool) {
      try {
        await this.pool.query('SELECT 1');
      } catch {
        dbOk = false;
      }
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk,
      redis: true,
      timestamp: new Date().toISOString(),
    };
  }
}
