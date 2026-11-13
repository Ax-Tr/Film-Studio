import { Module } from '@nestjs/common';
import { parseAppEnvironment } from '@film-studio/contracts';
import { HealthController } from './health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';

const environment = parseAppEnvironment(process.env);

@Module({
  imports:
    environment.OIDC_ISSUER_URL === undefined
      ? []
      : [AuthModule.register(environment)],
  controllers: [HealthController],
})
export class AppModule {}
