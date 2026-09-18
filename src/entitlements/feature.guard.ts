import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureKey } from '@prisma/client';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { EntitlementService } from './entitlement.service';
import { REQUIRED_FEATURE_KEY } from './require-feature.decorator';
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly entitlements: EntitlementService) {}
  async canActivate(context: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride<FeatureKey>(REQUIRED_FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!feature) return true;
    const tenant = context.switchToHttp().getRequest<{ user?: { tenantContext?: TenantContext } }>().user?.tenantContext;
    if (!tenant || !await this.entitlements.isFeatureEnabled(tenant, feature)) throw new ForbiddenException(`Feature ${feature} is not available for this organization`);
    return true;
  }
}
