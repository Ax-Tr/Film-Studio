import { Controller, Get } from '@nestjs/common';
import type { ServiceStatus } from '@film-studio/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): ServiceStatus {
    return {
      service: 'api',
      status: 'ok',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
