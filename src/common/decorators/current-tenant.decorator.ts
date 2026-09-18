import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { CurrentUserPayload } from './current-user.decorator';
import type { TenantContext } from '../tenant/tenant-context.types';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const request = context.switchToHttp().getRequest<{
      user?: CurrentUserPayload;
    }>();
    if (!request.user?.tenantContext) {
      throw new UnauthorizedException('Validated Tenant context is required');
    }
    return request.user.tenantContext;
  },
);
