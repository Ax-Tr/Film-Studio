import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { parseAppEnvironment } from '@film-studio/contracts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

async function bootstrap(): Promise<void> {
  const environment = parseAppEnvironment(process.env);
  const application = await NestFactory.create(AppModule, {
    bodyParser: true,
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

  await application.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
