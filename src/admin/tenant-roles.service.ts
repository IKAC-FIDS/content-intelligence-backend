import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleScope, UserRole } from '@prisma/client';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRoleDto,
  ReplaceRolePermissionsDto,
  UpdateRoleDto,
} from './dto/rbac-management.dto';

const ADMIN_REQUIRED = ['permission:manage', 'role:manage'];

@Injectable()
export class TenantRolesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenant: TenantContext) {
    return this.prisma.role.findMany({
      where: {
        OR: [
          { scope: RoleScope.SYSTEM },
          {
            scope: RoleScope.TENANT,
            organizationId: tenant.organizationId,
          },
        ],
      },
      include: {
        _count: {
          select: {
            users: true,
            permissions: true,
          },
        },
      },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string, tenant: TenantContext) {
    const role = await this.prisma.role.findFirst({
      where: {
        id,
        OR: [
          { scope: RoleScope.SYSTEM },
          {
            scope: RoleScope.TENANT,
            organizationId: tenant.organizationId,
          },
        ],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            users: true,
            permissions: true,
            organizationMemberships: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async create(dto: CreateRoleDto, tenant: TenantContext) {
    const normalizedCode = dto.code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new BadRequestException('Role code is required');
    }

    const tenantKey = tenant.organizationId.replace(/-/g, '').toUpperCase();
    const internalCode = `TENANT_${tenantKey}_${normalizedCode}`;

    try {
      return await this.prisma.role.create({
        data: {
          code: internalCode,
          normalizedCode,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          baseRole: dto.baseRole ?? UserRole.REP,
          isSystem: false,
          isActive: dto.isActive ?? true,
          scope: RoleScope.TENANT,
          organizationId: tenant.organizationId,
        },
        include: {
          _count: {
            select: {
              users: true,
              permissions: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Role code already exists in this tenant');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoleDto, tenant: TenantContext) {
    const current = await this.get(id, tenant);

    if (current.scope === RoleScope.SYSTEM) {
      throw new ForbiddenException(
        'System role definitions are operator controlled',
      );
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description.trim() || null,
        }),
        ...(dto.baseRole !== undefined && { baseRole: dto.baseRole }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        _count: {
          select: {
            users: true,
            permissions: true,
          },
        },
      },
    });
  }

  async remove(id: string, tenant: TenantContext) {
    const current = await this.get(id, tenant);

    if (current.scope === RoleScope.SYSTEM) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    if (current._count.users) {
      throw new ConflictException('Role is assigned to users');
    }

    if (current._count.organizationMemberships) {
      throw new ConflictException(
        'Role is assigned to organization memberships',
      );
    }

    return this.prisma.role.delete({ where: { id } });
  }

  async permissions(id: string, tenant: TenantContext) {
    const role = await this.get(id, tenant);

    const permissions = await this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ group: 'asc' }, { action: 'asc' }],
    });

    const assigned = new Set(
      role.permissions.map((item) => item.permissionId),
    );

    return {
      role: {
        id: role.id,
        code: role.code,
        normalizedCode: role.normalizedCode,
        name: role.name,
        scope: role.scope,
      },
      assignedPermissionIds: [...assigned],
      assignedActions: role.permissions.map(
        (item) => item.permission.action,
      ),
      permissions: permissions.map((item) => ({
        ...item,
        assigned: assigned.has(item.id),
      })),
    };
  }

  async replacePermissions(
    id: string,
    dto: ReplaceRolePermissionsDto,
    tenant: TenantContext,
  ) {
    const role = await this.get(id, tenant);

    const permissions = await this.prisma.permission.findMany({
      where: {
        id: { in: dto.permissionIds },
        isActive: true,
      },
    });

    if (permissions.length !== dto.permissionIds.length) {
      throw new BadRequestException(
        'One or more permissions do not exist or are inactive',
      );
    }

    const actions = new Set(
      permissions.map((permission) => permission.action),
    );

    if (
      role.baseRole === UserRole.ADMIN &&
      ADMIN_REQUIRED.some((action) => !actions.has(action))
    ) {
      throw new ForbiddenException(
        'ADMIN-based tenant roles must retain permission:manage and role:manage',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where:
          role.scope === RoleScope.SYSTEM
            ? { OR: [{ roleId: id }, { role: role.baseRole }] }
            : { roleId: id },
      });

      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: id,
            role:
              role.scope === RoleScope.SYSTEM ? role.baseRole : null,
            permissionId: permission.id,
          })),
        });
      }

      await tx.organization.updateMany({
        where:
          role.scope === RoleScope.SYSTEM
            ? {}
            : { id: tenant.organizationId },
        data: { authorizationVersion: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          actorId: tenant.userId,
          organizationId: tenant.organizationId,
          entityType: 'tenant-rbac',
          entityId: id,
          action: 'tenant-role.permissions-replaced',
          before: {
            permissionIds: role.permissions.map((item) => item.permissionId),
          },
          after: { permissionIds: permissions.map((item) => item.id) },
        },
      });
    });

    PermissionsGuard.clearCache(role.baseRole);
    PermissionsGuard.clearCache(`role:${id}`);

    return this.permissions(id, tenant);
  }
}
