import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { QuotaMetric } from '@prisma/client';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { QuotaService } from './quota.service';

@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly quota: QuotaService) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<
      Request & {
        user?: { tenantContext?: TenantContext };
        requestId?: string;
      }
    >();
    const tenant = request.user?.tenantContext;
    const path = request.originalUrl || request.url;
    if (tenant && !path.startsWith('/api/health')) {
      const key = request.requestId
        ? `http:${request.requestId}`
        : `http:${tenant.userId}:${request.method}:${path}:${Date.now()}`;
      await this.quota.consumeEvent(
        tenant.organizationId,
        QuotaMetric.API_CALLS,
        1n,
        key,
        new Date(),
        tenant.userId,
        request.requestId,
      );
    }
    return next.handle();
  }
}
