import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatform } from '../common/decorators/current-platform.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { PlatformScopeContext, TenantContext } from '../common/tenant/tenant-context.types';
import { PlatformAdminGuard } from '../platform-authority/platform-admin.guard';
import { CreateLanguageDto, FindLanguagesDto, UpdateLanguageDto } from './dto/language.dto';
import { LanguagesService } from './languages.service';

@ApiTags('Languages') @Controller('languages') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class LanguagesController {
  constructor(private readonly service: LanguagesService) {}
  @Get() @Permissions('workspace:view') @ApiOperation({ summary: 'List active selectable Languages' })
  list(@Query() query: FindLanguagesDto, @CurrentTenant() tenant: TenantContext) { return this.service.listSelectable(query, tenant); }
}

@ApiTags('Platform Admin') @Controller('admin/languages') @UseGuards(PlatformAdminGuard)
export class PlatformLanguagesController {
  constructor(private readonly service: LanguagesService) {}
  @Get() list(@Query() query: FindLanguagesDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.listAdmin(query, platform); }
  @Get(':id') get(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.findOne(id, platform); }
  @Post() create(@Body() dto: CreateLanguageDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.create(dto, platform); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateLanguageDto, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.update(id, dto, platform); }
  @Patch(':id/activate') activate(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.setActive(id, true, platform); }
  @Patch(':id/deactivate') deactivate(@Param('id') id: string, @CurrentPlatform() platform: PlatformScopeContext) { return this.service.setActive(id, false, platform); }
}
