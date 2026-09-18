import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleScope, UserRole } from '@prisma/client';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { AssignMembershipRoleDto, CreateTenantRoleDto, ReplaceTenantRolePermissionsDto, UpdateTenantRoleDto } from './dto/tenant-rbac.dto';

@Injectable()
export class TenantRbacService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenant: TenantContext) {
    return this.prisma.role.findMany({
      where: { OR: [{ scope: RoleScope.SYSTEM, organizationId: null }, { scope: RoleScope.TENANT, organizationId: tenant.organizationId }] },
      select: { id: true, code: true, normalizedCode: true, name: true, description: true, baseRole: true, scope: true, isActive: true, _count: { select: { permissions: true, organizationMemberships: true } } },
      orderBy: [{ scope: 'asc' }, { normalizedCode: 'asc' }, { code: 'asc' }],
    });
  }

  async get(id: string, tenant: TenantContext) {
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ scope: RoleScope.SYSTEM, organizationId: null }, { scope: RoleScope.TENANT, organizationId: tenant.organizationId }] },
      include: { permissions: { include: { permission: true } }, _count: { select: { organizationMemberships: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateTenantRoleDto, tenant: TenantContext, actorId: string) {
    const normalizedCode = dto.code.toUpperCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({ data: {
          code: `TENANT_${tenant.organizationId.replace(/-/g, '')}_${normalizedCode}`,
          normalizedCode, name: dto.name, description: dto.description,
          baseRole: dto.baseRole ?? UserRole.REP, isSystem: false, isActive: true,
          scope: RoleScope.TENANT, organizationId: tenant.organizationId,
        }});
        await this.bumpAndAudit(tx, tenant.organizationId, actorId, 'tenant-role.created', role.id, undefined, role);
        return role;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Role code already exists in this organization');
      throw error;
    }
  }

  async update(id: string, dto: UpdateTenantRoleDto, tenant: TenantContext, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.role.findFirst({ where: { id, scope: RoleScope.TENANT, organizationId: tenant.organizationId } });
      if (!current) throw new NotFoundException('Role not found');
      if (dto.isActive === false && await tx.organizationMembership.count({ where: { roleId: id, status: 'ACTIVE' } })) throw new ConflictException('Active memberships still use this role');
      const updated = await tx.role.update({ where: { id }, data: dto });
      await this.bumpAndAudit(tx, tenant.organizationId, actorId, dto.isActive === false ? 'tenant-role.disabled' : 'tenant-role.updated', id, current, updated);
      return updated;
    });
  }

  async replacePermissions(id: string, dto: ReplaceTenantRolePermissionsDto, tenant: TenantContext, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({ where: { id, scope: RoleScope.TENANT, organizationId: tenant.organizationId, isActive: true }, include: { permissions: true } });
      if (!role) throw new NotFoundException('Role not found');
      const permissionIds = [...new Set(dto.permissionIds)];
      const permissions = await tx.permission.findMany({ where: { id: { in: permissionIds }, isActive: true }, select: { id: true } });
      if (permissions.length !== permissionIds.length) throw new BadRequestException('One or more permissions do not exist or are inactive');
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length) await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) });
      await this.bumpAndAudit(tx, tenant.organizationId, actorId, 'tenant-role.permissions-replaced', id, { permissionIds: role.permissions.map((item) => item.permissionId) }, { permissionIds });
      return { roleId: id, permissionIds };
    });
  }

  async assign(membershipId: string, dto: AssignMembershipRoleDto, tenant: TenantContext, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId: tenant.organizationId } });
      if (!membership) throw new NotFoundException('Membership not found');
      const role = await tx.role.findFirst({ where: { id: dto.roleId, isActive: true, OR: [{ scope: RoleScope.SYSTEM, organizationId: null }, { scope: RoleScope.TENANT, organizationId: tenant.organizationId }] } });
      if (!role) throw new NotFoundException('Role not found');
      const updated = await tx.organizationMembership.update({ where: { id: membershipId }, data: { roleId: role.id } });
      await this.bumpAndAudit(tx, tenant.organizationId, actorId, 'membership-role.assigned', membershipId, { roleId: membership.roleId }, { roleId: role.id });
      return updated;
    });
  }

  async revoke(membershipId: string, tenant: TenantContext, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId: tenant.organizationId } });
      if (!membership) throw new NotFoundException('Membership not found');
      const updated = await tx.organizationMembership.update({ where: { id: membershipId }, data: { roleId: null } });
      await this.bumpAndAudit(tx, tenant.organizationId, actorId, 'membership-role.revoked', membershipId, { roleId: membership.roleId }, { roleId: null });
      return updated;
    });
  }

  private async bumpAndAudit(tx: Prisma.TransactionClient, organizationId: string, actorId: string, action: string, entityId: string, before?: unknown, after?: unknown) {
    await tx.organization.update({ where: { id: organizationId }, data: { authorizationVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId, organizationId, entityType: 'tenant-rbac', entityId, action, ...(before !== undefined && { before: before as Prisma.InputJsonValue }), ...(after !== undefined && { after: after as Prisma.InputJsonValue }) } });
  }
}
