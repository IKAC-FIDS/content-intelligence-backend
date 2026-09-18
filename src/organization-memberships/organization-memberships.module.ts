import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationMembershipsService } from './organization-memberships.service';
import { TenantResolverService } from './tenant-resolver.service';
import { TenantRbacService } from './tenant-rbac.service';
import { TenantMembershipRolesController, TenantRolesController } from './tenant-rbac.controller';

@Module({
  imports: [PrismaModule],
  providers: [OrganizationMembershipsService, TenantResolverService, TenantRbacService],
  controllers: [TenantRolesController, TenantMembershipRolesController],
  exports: [OrganizationMembershipsService, TenantResolverService, TenantRbacService],
})
export class OrganizationMembershipsModule {}
