import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import {
  CreateRoleDto,
  ReplaceRolePermissionsDto,
  UpdateRoleDto,
} from './dto/rbac-management.dto';
import { TenantRolesService } from './tenant-roles.service';

@Controller('organization/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRolesController {
  constructor(private readonly service: TenantRolesService) {}

  @Get()
  @Permissions('role:view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Get(':id')
  @Permissions('role:view')
  get(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.get(id, tenant);
  }

  @Post()
  @Permissions('role:manage')
  create(
    @Body() dto: CreateRoleDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.create(dto, tenant);
  }

  @Patch(':id')
  @Permissions('role:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, dto, tenant);
  }

  @Delete(':id')
  @Permissions('role:manage')
  remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.remove(id, tenant);
  }

  @Get(':id/permissions')
  @Permissions('role:view')
  permissions(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.permissions(id, tenant);
  }

  @Put(':id/permissions')
  @Permissions('role:manage')
  replacePermissions(
    @Param('id') id: string,
    @Body() dto: ReplaceRolePermissionsDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.replacePermissions(id, dto, tenant);
  }
}
