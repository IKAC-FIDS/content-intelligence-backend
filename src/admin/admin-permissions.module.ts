import { Module } from '@nestjs/common';
import { AdminPermissionsService } from './admin-permissions.service';
import { AdminPermissionsController } from './admin-permissions.controller';
import { PermissionsManagementController, RolesManagementController } from './rbac-management.controller';
import { RbacManagementService } from './rbac-management.service';
import { TenantRolesService } from './tenant-roles.service';
import { TenantRolesController } from './tenant-roles.controller';

@Module({
  providers: [AdminPermissionsService, RbacManagementService, TenantRolesService],
  controllers: [AdminPermissionsController, PermissionsManagementController, RolesManagementController, TenantRolesController],
  exports: [AdminPermissionsService],
})
export class AdminPermissionsModule {}
