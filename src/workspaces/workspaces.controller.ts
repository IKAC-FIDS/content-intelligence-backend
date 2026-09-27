import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { FindWorkspacesDto } from './dto/find-workspaces.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces')
@Controller('workspaces')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  @Post()
  @Permissions('workspace:create')
  @ApiOperation({
    summary: 'Create a Workspace in the active Tenant',
    description: 'Requires workspace:create. Tenant ownership is derived from trusted TenantContext.',
  })
  create(@Body() dto: CreateWorkspaceDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(dto, tenant);
  }

  @Get()
  @Permissions('workspace:view')
  @ApiOperation({
    summary: 'List Workspaces in the active Tenant',
    description: 'Requires workspace:view. ACTIVE is the default status filter.',
  })
  findAll(@Query() query: FindWorkspacesDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.findAll(query, tenant);
  }

  @Get(':id')
  @Permissions('workspace:view')
  @ApiOperation({ summary: 'Get a Workspace from the active Tenant', description: 'Requires workspace:view.' })
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findOne(id, tenant);
  }

  @Patch(':id')
  @Permissions('workspace:update')
  @ApiOperation({
    summary: 'Update an active Workspace in the active Tenant',
    description: 'Requires workspace:update. Code and Tenant ownership are immutable.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, dto, tenant);
  }

  @Patch(':id/archive')
  @Permissions('workspace:archive')
  @ApiOperation({
    summary: 'Archive a Workspace in the active Tenant',
    description: 'Requires workspace:archive. Archiving retains the Workspace and is idempotent.',
  })
  archive(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.archive(id, tenant);
  }
}
