import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { buildRefreshTokenCookieOptions } from './common/cookies/refresh-token-cookie';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { configureRuntimeOpenApi } from './openapi/openapi.runtime';

function parseCorsOrigins(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  buildRefreshTokenCookieOptions(); // Fail before listening when cookie configuration is unsafe.
  const httpAdapter = app.getHttpAdapter().getInstance();
  const corsLogger = new Logger('Cors');

  httpAdapter.set('trust proxy', 1);

  // Run before CORS and all Nest route middleware so even bootstrap-level
  // failures have a correlation id available to the global exception filter.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const suppliedRequestId = req.header('x-request-id')?.trim();
    const requestId = suppliedRequestId || randomUUID();

    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const allowedOrigins = parseCorsOrigins(
    config.get<string>('CORS_ORIGINS', 'http://localhost:5173'),
  );
  const corsCredentials = config.get<boolean>('CORS_CREDENTIALS', true);

  if (corsCredentials && allowedOrigins.includes('*')) {
    throw new Error(
      'CORS_ORIGINS must not contain "*" when CORS_CREDENTIALS is enabled',
    );
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');

    if (!origin || allowedOrigins.includes(origin)) {
      next();
      return;
    }

    const requestId = (req as Request & { requestId?: string }).requestId ?? null;
    const context = {
      requestId,
      origin,
      method: req.method,
      url: req.originalUrl || req.url,
      allowedOriginsCount: allowedOrigins.length,
      allowedOrigins,
    };

    corsLogger.warn('CORS origin rejected', JSON.stringify(context));
    res.status(403).json({
      success: false,
      error: {
        code: 'CORS_ORIGIN_REJECTED',
        message: 'Request origin is not allowed',
      },
      requestId,
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url,
      method: req.method,
      statusCode: 403,
    });
  });

  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Request origin is not allowed'), false);
    },
    credentials: corsCredentials,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
    ],
    exposedHeaders: [
      'x-request-id',
      'Content-Disposition',
      'Content-Length',
      'Content-Type',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  app.setGlobalPrefix('api');

  const runtimeDocsEnabled = config.get<boolean>(
    'OPENAPI_RUNTIME_ENABLED',
    false,
  );
  configureRuntimeOpenApi(app, runtimeDocsEnabled);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`IAM CRM API is running on port ${port}`);
}

bootstrap();
