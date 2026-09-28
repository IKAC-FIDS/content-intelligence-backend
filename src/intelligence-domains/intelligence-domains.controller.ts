import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatform } from '../common/decorators/current-platform.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { PlatformScopeContext, TenantContext } from '../common/tenant/tenant-context.types';
import { PlatformAdminGuard } from '../platform-authority/platform-admin.guard';
import { CreateIntelligenceDomainDto, FindIntelligenceDomainsDto, UpdateIntelligenceDomainDto } from './dto/intelligence-domain.dto';
import { IntelligenceDomainsService } from './intelligence-domains.service';

@ApiTags('Intelligence Domains') @Controller('intelligence-domains') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntelligenceDomainsController {
  constructor(private readonly service: IntelligenceDomainsService) {}
  @Get() @Permissions('workspace:view') @ApiOperation({ summary: 'List active selectable Intelligence Domains' })
  list(@Query() query: FindIntelligenceDomainsDto, @CurrentTenant() tenant: TenantContext) { return this.service.listSelectable(query, tenant); }
}

@ApiTags('Platform Admin') @Controller('admin/intelligence-domains') @UseGuards(PlatformAdminGuard)
export class PlatformIntelligenceDomainsController {
  constructor(private readonly service: IntelligenceDomainsService) {}
  @Get() list(@Query() query: FindIntelligenceDomainsDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.listAdmin(query, platform); }
  @Get(':id') get(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.findOne(id, platform); }
  @Post() create(@Body() dto: CreateIntelligenceDomainDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.create(dto, platform); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateIntelligenceDomainDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.update(id, dto, platform); }
  @Patch(':id/activate') activate(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.setActive(id, true, platform); }
  @Patch(':id/deactivate') deactivate(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.setActive(id, false, platform); }
}
