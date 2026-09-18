import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** Cookie mutation endpoints require a browser Origin, even when CORS is bypassed. */
@Injectable()
export class CookieOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.get('origin');
    const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map(value => value.trim());
    // Explicit development/test CLI compatibility only. Production never accepts missing Origin.
    if (!origin && process.env.NODE_ENV !== 'production' && process.env.AUTH_ALLOW_MISSING_ORIGIN === 'true') return true;
    if (origin && origin !== 'null' && allowed.includes(origin)) return true;
    throw new ForbiddenException({ code: 'AUTH_ORIGIN_REJECTED', message: 'A trusted Origin is required' });
  }
}
