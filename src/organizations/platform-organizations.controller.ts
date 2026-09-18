import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPlatform } from '../common/decorators/current-platform.decorator';
import type { PlatformScopeContext } from '../common/tenant/tenant-context.types';
import { PlatformAdminGuard } from '../platform-authority/platform-admin.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { FindOrganizationsDto } from './dto/find-organizations.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ProvisionOrganizationDto } from './dto/provision-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('admin/organizations')
@UseGuards(PlatformAdminGuard)
export class PlatformOrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  findAll(@Query() query: FindOrganizationsDto, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.findAll(query, platform);
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.create(dto, platform);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.findOne(id, platform);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.update(id, dto, platform);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.activate(id, platform);
  }

  @Post(':id/provision')
  provision(
    @Param('id') id: string,
    @Body() dto: ProvisionOrganizationDto,
    @CurrentPlatform() platform: PlatformScopeContext,
  ) {
    return this.service.provision(id, dto, platform);
  }

  @Get(':id/onboarding')
  onboarding(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.onboarding(id, platform);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.suspend(id, platform);
  }

  @Patch(':id/resume')
  resume(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.resume(id, platform);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) {
    return this.service.archive(id, platform);
  }
}
