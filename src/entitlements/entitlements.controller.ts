import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { FeatureKey } from '@prisma/client';
import { CurrentPlatform } from '../common/decorators/current-platform.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { PlatformScopeContext, TenantContext } from '../common/tenant/tenant-context.types';
import { PlatformAdminGuard } from '../platform-authority/platform-admin.guard';
import { CreatePlanDto, CreateSubscriptionDto, SetEntitlementOverrideDto, SetPlanFeatureDto, TransitionSubscriptionDto, UpdatePlanDto, UpdateSubscriptionDto } from './dto/entitlement.dto';
import { EntitlementService } from './entitlement.service';
import { PlatformEntitlementsService } from './platform-entitlements.service';

@Controller('admin/plans') @UseGuards(PlatformAdminGuard)
export class PlatformPlansController {
  constructor(private readonly service: PlatformEntitlementsService) {}
  @Get() list() { return this.service.plans(); }
  @Post() create(@Body() dto: CreatePlanDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.createPlan(dto, platform); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.updatePlan(id, dto, platform); }
  @Put(':id/features/:feature') feature(@Param('id') id: string, @Param('feature', new ParseEnumPipe(FeatureKey)) feature: FeatureKey, @Body() dto: SetPlanFeatureDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.setFeature(id, feature, dto, platform); }
}
@Controller('admin/organizations') @UseGuards(PlatformAdminGuard)
export class PlatformSubscriptionsController {
  constructor(private readonly service: PlatformEntitlementsService) {}
  @Get(':organizationId/subscription') current(@Param('organizationId') id: string) { return this.service.currentSubscription(id); }
  @Post(':organizationId/subscriptions') create(@Param('organizationId') id: string, @Body() dto: CreateSubscriptionDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.createSubscription(id, dto, platform); }
  @Get(':organizationId/entitlements') overrides(@Param('organizationId') id: string) { return this.service.listOverrides(id); }
  @Put(':organizationId/entitlements/:feature') set(@Param('organizationId') id: string, @Param('feature', new ParseEnumPipe(FeatureKey)) feature: FeatureKey, @Body() dto: SetEntitlementOverrideDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.setOverride(id, feature, dto, platform); }
  @Delete(':organizationId/entitlements/:feature') remove(@Param('organizationId') id: string, @Param('feature', new ParseEnumPipe(FeatureKey)) feature: FeatureKey, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.removeOverride(id, feature, platform); }
}
@Controller('admin/subscriptions') @UseGuards(PlatformAdminGuard)
export class PlatformSubscriptionTransitionsController { constructor(private readonly service: PlatformEntitlementsService) {} @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.updateSubscription(id, dto, platform); } @Patch(':id/status') transition(@Param('id') id: string, @Body() dto: TransitionSubscriptionDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.transition(id, dto, platform); } }
@Controller('entitlements') @UseGuards(JwtAuthGuard)
export class TenantEntitlementsController { constructor(private readonly service: EntitlementService) {} @Get('current') current(@CurrentTenant() tenant: TenantContext) { return this.service.current(tenant); } }
