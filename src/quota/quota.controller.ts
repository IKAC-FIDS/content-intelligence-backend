import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { QuotaMetric } from '@prisma/client';
import { CurrentPlatform } from '../common/decorators/current-platform.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type {
  PlatformScopeContext,
  TenantContext,
} from '../common/tenant/tenant-context.types';
import { PlatformAdminGuard } from '../platform-authority/platform-admin.guard';
import {
  SetOrganizationQuotaOverrideDto,
  SetPlanQuotaDto,
} from './dto/quota.dto';
import { PlatformQuotaService } from './platform-quota.service';
import { QuotaService } from './quota.service';

@Controller('admin/plans/:planId/quotas')
@UseGuards(PlatformAdminGuard)
export class PlatformPlanQuotaController {
  constructor(private readonly service: PlatformQuotaService) {}
  @Get() list(@Param('planId') planId: string) {
    return this.service.planQuotas(planId);
  }
  @Put(':metric') set(
    @Param('planId') planId: string,
    @Param('metric', new ParseEnumPipe(QuotaMetric)) metric: QuotaMetric,
    @Body() dto: SetPlanQuotaDto,
    @CurrentPlatform() platform: PlatformScopeContext,
  ) {
    return this.service.setPlanQuota(planId, metric, dto, platform);
  }
}

@Controller('admin/organizations/:organizationId/quotas')
@UseGuards(PlatformAdminGuard)
export class PlatformOrganizationQuotaController {
  constructor(private readonly service: PlatformQuotaService) {}
  @Get() list(@Param('organizationId') id: string) {
    return this.service.organizationOverrides(id);
  }
  @Put(':metric') set(
    @Param('organizationId') id: string,
    @Param('metric', new ParseEnumPipe(QuotaMetric)) metric: QuotaMetric,
    @Body() dto: SetOrganizationQuotaOverrideDto,
    @CurrentPlatform() platform: PlatformScopeContext,
  ) {
    return this.service.setOverride(id, metric, dto, platform);
  }
  @Delete(':metric') remove(
    @Param('organizationId') id: string,
    @Param('metric', new ParseEnumPipe(QuotaMetric)) metric: QuotaMetric,
    @CurrentPlatform() platform: PlatformScopeContext,
  ) {
    return this.service.removeOverride(id, metric, platform);
  }
}

@Controller('quota')
@UseGuards(JwtAuthGuard)
export class TenantQuotaController {
  constructor(private readonly service: QuotaService) {}
  @Get('current') current(@CurrentTenant() tenant: TenantContext) {
    return this.service.summaryForTenant(tenant);
  }
}
