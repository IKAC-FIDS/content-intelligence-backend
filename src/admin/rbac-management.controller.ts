import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateManagedPermissionDto, CreateRoleDto, ReplaceRolePermissionsDto, UpdateManagedPermissionDto, UpdateRoleDto } from './dto/rbac-management.dto';
import { RbacManagementService } from './rbac-management.service';
import { TenantRolesService } from './tenant-roles.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PlatformAdminGuard } from '../platform-authority/platform-admin.guard';

@Controller('permissions')
export class PermissionsManagementController {
  constructor(private readonly service: RbacManagementService) {}
  @Get() @UseGuards(JwtAuthGuard, PermissionsGuard) @Permissions('permission:view') findAll() { return this.service.permissions(); }
  @Get(':id') @UseGuards(JwtAuthGuard, PermissionsGuard) @Permissions('permission:view') findOne(@Param('id') id: string) { return this.service.permission(id); }
  @Post() @UseGuards(PlatformAdminGuard) create(@Body() dto: CreateManagedPermissionDto) { return this.service.createPermission(dto); }
  @Patch(':id') @UseGuards(PlatformAdminGuard) update(@Param('id') id: string, @Body() dto: UpdateManagedPermissionDto) { return this.service.updatePermission(id, dto); }
  @Delete(':id') @UseGuards(PlatformAdminGuard) remove(@Param('id') id: string) { return this.service.deletePermission(id); }
}

@Controller('roles') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesManagementController {
  constructor(private readonly service: TenantRolesService, private readonly platformService: RbacManagementService) {}
  @Get() @Permissions('role:view') findAll(@CurrentTenant() tenant: TenantContext) { return this.service.list(tenant); }
  @Get(':id') @Permissions('role:view') findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) { return this.service.get(id, tenant); }
  // Preserve the legacy create rejection; creation remains on the tenant APIs.
  @Post() @Permissions('role:manage') create(@Body() dto: CreateRoleDto) { return this.platformService.createRole(dto); }
  @Patch(':id') @Permissions('role:manage') update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentTenant() tenant: TenantContext) { return this.service.update(id, dto, tenant); }
  @Delete(':id') @Permissions('role:manage') remove(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) { return this.service.remove(id, tenant); }
  @Get(':id/permissions') @Permissions('role:view') permissions(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) { return this.service.permissions(id, tenant); }
  @Put(':id/permissions') @Permissions('role:manage') replacePermissions(@Param('id') id: string, @Body() dto: ReplaceRolePermissionsDto, @CurrentTenant() tenant: TenantContext) { return this.service.replacePermissions(id, dto, tenant); }
}

@Controller('platform/roles') @UseGuards(PlatformAdminGuard)
export class PlatformRolesManagementController {
  constructor(private readonly service: RbacManagementService) {}
  @Get() findAll() { return this.service.roles(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.role(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRoleDto) { return this.service.updateRole(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.deleteRole(id); }
  @Get(':id/permissions') permissions(@Param('id') id: string) { return this.service.rolePermissions(id); }
  @Put(':id/permissions') replacePermissions(@Param('id') id: string, @Body() dto: ReplaceRolePermissionsDto) { return this.service.replaceRolePermissions(id, dto); }
}
