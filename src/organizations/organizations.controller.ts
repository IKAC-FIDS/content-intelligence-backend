import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { OrganizationsService } from './organizations.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { OrganizationConfigurationService } from './organization-configuration.service';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { UpdateOrganizationBrandingDto } from './dto/update-organization-branding.dto';
import { CreateOrganizationDomainDto } from './dto/create-organization-domain.dto';
import { UpdateOrganizationDomainDto } from './dto/update-organization-domain.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService, private readonly configuration: OrganizationConfigurationService) {}

  @Get('organizations/current')
  @Permissions('organization:view')
  current(@CurrentUser() user: CurrentUserPayload) {
    return this.service.current(user);
  }

  @Get('organization/settings')
  @Permissions('organization:view')
  settings(@CurrentTenant() tenant: TenantContext) { return this.configuration.getSettings(tenant); }

  @Patch('organization/settings')
  @Permissions('organization:manage')
  updateSettings(@Body() dto: UpdateOrganizationSettingsDto, @CurrentTenant() tenant: TenantContext) { return this.configuration.updateSettings(dto, tenant); }

  @Get('organization/branding')
  @Permissions('organization:view')
  branding(@CurrentTenant() tenant: TenantContext) { return this.configuration.getBranding(tenant); }

  @Patch('organization/branding')
  @Permissions('organization:manage')
  updateBranding(@Body() dto: UpdateOrganizationBrandingDto, @CurrentTenant() tenant: TenantContext) { return this.configuration.updateBranding(dto, tenant); }

  @Get('organization/domains')
  @Permissions('organization:view')
  domains(@CurrentTenant() tenant: TenantContext) { return this.configuration.listDomains(tenant); }

  @Get('organization/domains/:id')
  @Permissions('organization:view')
  domain(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) { return this.configuration.getDomain(id, tenant); }

  @Post('organization/domains')
  @Permissions('organization:manage')
  createDomain(@Body() dto: CreateOrganizationDomainDto, @CurrentTenant() tenant: TenantContext) { return this.configuration.createDomain(dto, tenant); }

  @Patch('organization/domains/:id')
  @Permissions('organization:manage')
  updateDomain(@Param('id') id: string, @Body() dto: UpdateOrganizationDomainDto, @CurrentTenant() tenant: TenantContext) { return this.configuration.updateDomain(id, dto, tenant); }

  @Post('organization/domains/:id/verify')
  @Permissions('organization:manage')
  verifyDomain(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) { return this.configuration.verifyDomain(id, tenant); }

}
