import { Module } from '@nestjs/common';
import { AdminPermissionsService } from './admin-permissions.service';
import { AdminPermissionsController } from './admin-permissions.controller';
import { PermissionsManagementController, RolesManagementController, PlatformRolesManagementController } from './rbac-management.controller';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';
import { RbacManagementService } from './rbac-management.service';
import { TenantRolesService } from './tenant-roles.service';
import { TenantRolesController } from './tenant-roles.controller';

@Module({
  imports: [PlatformAuthorityModule, OrganizationMembershipsModule],
  providers: [AdminPermissionsService, RbacManagementService, TenantRolesService],
  controllers: [AdminPermissionsController, PermissionsManagementController, RolesManagementController, PlatformRolesManagementController, TenantRolesController],
  exports: [AdminPermissionsService],
})
export class AdminPermissionsModule {}
