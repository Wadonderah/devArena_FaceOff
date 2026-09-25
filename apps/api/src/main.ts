import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(AppConfigService);
  const allowedOrigins = config.get('CORS_ORIGINS');

  // Behind nginx; without this the throttler and audit log record the proxy IP
  // for every request, which would make per-IP rate limiting meaningless.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());

  app.enableCors({
    // Refuse by withholding the CORS headers rather than raising — throwing here
    // surfaces as a 500 before any guard runs. The browser blocks the response
    // either way, and OriginGuard still rejects the request server-side with a
    // proper 403 for clients that ignore CORS entirely.
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live'] });
  app.enableShutdownHooks();

    const port = config.get('PORT');
    app.enableShutdownHooks();
    await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`API listening on port ${port}`);
}

void bootstrap();
