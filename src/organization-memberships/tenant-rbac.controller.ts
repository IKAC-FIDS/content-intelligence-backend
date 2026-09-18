import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { AssignMembershipRoleDto, CreateTenantRoleDto, ReplaceTenantRolePermissionsDto, UpdateTenantRoleDto } from './dto/tenant-rbac.dto';
import { TenantRbacService } from './tenant-rbac.service';

@Controller('tenant/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRolesController {
  constructor(private readonly service: TenantRbacService) {}
  @Get() @Permissions('role:view') list(@CurrentTenant() tenant: TenantContext) { return this.service.list(tenant); }
  @Get(':id') @Permissions('role:view') get(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) { return this.service.get(id, tenant); }
  @Post() @Permissions('role:manage') create(@Body() dto: CreateTenantRoleDto, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: CurrentUserPayload) { return this.service.create(dto, tenant, user.userId); }
  @Patch(':id') @Permissions('role:manage') update(@Param('id') id: string, @Body() dto: UpdateTenantRoleDto, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: CurrentUserPayload) { return this.service.update(id, dto, tenant, user.userId); }
  @Put(':id/permissions') @Permissions('role:manage') permissions(@Param('id') id: string, @Body() dto: ReplaceTenantRolePermissionsDto, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: CurrentUserPayload) { return this.service.replacePermissions(id, dto, tenant, user.userId); }
}

@Controller('tenant/memberships')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantMembershipRolesController {
  constructor(private readonly service: TenantRbacService) {}
  @Put(':id/role') @Permissions('role:manage') assign(@Param('id') id: string, @Body() dto: AssignMembershipRoleDto, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: CurrentUserPayload) { return this.service.assign(id, dto, tenant, user.userId); }
  @Delete(':id/role') @Permissions('role:manage') revoke(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: CurrentUserPayload) { return this.service.revoke(id, tenant, user.userId); }
}
