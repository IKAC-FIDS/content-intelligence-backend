import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequestWithRequestId } from '../common/logging/http-log-context';
import { AuditRequestContextService } from './audit-request-context.service';

@Injectable()
export class AuditRequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: AuditRequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestWithId = req as RequestWithRequestId;
    const requestId =
      requestWithId.requestId ||
      this.resolveHeaderValue(req.headers['x-request-id']) ||
      randomUUID();
    const userAgent = this.resolveHeaderValue(req.headers['user-agent']);
    const ipAddress = this.resolveClientIp(req);

    requestWithId.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    this.requestContext.run(
      {
        requestId,
        ipAddress,
        userAgent,
        requestMethod: req.method,
        requestPath: req.originalUrl || req.url,
      },
      () => next(),
    );
  }

  private resolveHeaderValue(
    value: string | string[] | undefined,
  ): string | null {
    if (Array.isArray(value)) return value[0]?.trim() || null;
    return value?.trim() || null;
  }

  private resolveClientIp(req: Request): string | null {
    // Express applies the configured `trust proxy` hop policy to req.ip.
    return (req.ip || req.socket?.remoteAddress || null)?.slice(0, 64) || null;
  }
}
