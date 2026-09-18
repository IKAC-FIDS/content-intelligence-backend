import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import {
  RequestWithRequestId,
  buildHttpLogContext,
} from './http-log-context';

@Injectable()
export class HttpRequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpRequestLoggingMiddleware.name);

  use(req: RequestWithRequestId, res: Response, next: NextFunction) {
    const startedAt = Date.now();

    res.on('finish', () => {
      const context = {
        ...buildHttpLogContext(req, res),
        durationMs: Date.now() - startedAt,
      };

      const message = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${context.durationMs}ms requestId=${context.requestId ?? 'none'}`;

      if (res.statusCode >= 500) {
        this.logger.error(message, JSON.stringify(context));
        return;
      }

      if (res.statusCode >= 400) {
        this.logger.warn(message, JSON.stringify(context));
        return;
      }

      this.logger.log(message, JSON.stringify(context));
    });

    next();
  }
}
