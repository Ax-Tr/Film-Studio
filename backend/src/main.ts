import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { parseAppEnvironment } from '@film-studio/contracts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { runMigrations } from './database/run-migrations.js';

async function bootstrap(): Promise<void> {
  const environment = parseAppEnvironment(process.env);

  try {
    await runMigrations();
  } catch (error) {
    console.error('Database migration auto-run notice:', error);
  }

  const application = await NestFactory.create(AppModule, {
    bodyParser: true,
  });

  application.use((req: any, _res: any, next: any) => {
    if (typeof req.url === 'string' && req.url.startsWith('/auth/')) {
      req.url = '/v1' + req.url;
    }
    next();
  });

  application.setGlobalPrefix('v1', { exclude: ['health', 'ready'] });
  application.use(helmet());
  application.use(cookieParser());
  application.useGlobalFilters(new ApiExceptionFilter());
  application.enableCors({
    credentials: true,
    origin: environment.ALLOWED_ORIGINS,
  });
  application.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : environment.API_PORT;
  const host = process.env.HOST ?? (environment.APP_ENV === 'production' ? '0.0.0.0' : environment.API_HOST);
  await application.listen(port, host);
}

void bootstrap();
