import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateManagedPermissionDto, CreateRoleDto, ReplaceRolePermissionsDto, UpdateManagedPermissionDto, UpdateRoleDto } from './dto/rbac-management.dto';
import { RbacManagementService } from './rbac-management.service';

@Controller('permissions') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsManagementController {
  constructor(private readonly service: RbacManagementService) {}
  @Get() @Permissions('permission:view') findAll() { return this.service.permissions(); }
  @Get(':id') @Permissions('permission:view') findOne(@Param('id') id: string) { return this.service.permission(id); }
  @Post() @Permissions('permission:manage') create(@Body() dto: CreateManagedPermissionDto) { return this.service.createPermission(dto); }
  @Patch(':id') @Permissions('permission:manage') update(@Param('id') id: string, @Body() dto: UpdateManagedPermissionDto) { return this.service.updatePermission(id, dto); }
  @Delete(':id') @Permissions('permission:manage') remove(@Param('id') id: string) { return this.service.deletePermission(id); }
}

@Controller('roles') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesManagementController {
  constructor(private readonly service: RbacManagementService) {}
  @Get() @Permissions('role:view') findAll() { return this.service.roles(); }
  @Get(':id') @Permissions('role:view') findOne(@Param('id') id: string) { return this.service.role(id); }
  @Post() @Permissions('role:manage') create(@Body() dto: CreateRoleDto) { return this.service.createRole(dto); }
  @Patch(':id') @Permissions('role:manage') update(@Param('id') id: string, @Body() dto: UpdateRoleDto) { return this.service.updateRole(id, dto); }
  @Delete(':id') @Permissions('role:manage') remove(@Param('id') id: string) { return this.service.deleteRole(id); }
  @Get(':id/permissions') @Permissions('role:view') permissions(@Param('id') id: string) { return this.service.rolePermissions(id); }
  @Put(':id/permissions') @Permissions('role:manage') replacePermissions(@Param('id') id: string, @Body() dto: ReplaceRolePermissionsDto) { return this.service.replaceRolePermissions(id, dto); }
}
