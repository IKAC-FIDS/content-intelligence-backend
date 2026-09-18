import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AdminPermissionsService {
  constructor(private prisma: PrismaService, private audit: AuditLogService) {}

  // ============================================================
  // ۱. دریافت لیست تمام دسترسی‌ها
  // ============================================================
  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { action: 'asc' },
    });
  }

  async getPermissionMatrix() {
    const roles = Object.values(UserRole);
    const permissions = await this.prisma.permission.findMany({
      orderBy: { action: 'asc' },
      include: { rolePermissions: { select: { role: true } } },
    });

    return {
      roles,
      permissions: permissions.map((permission) => {
        const assignedRoles = new Set(permission.rolePermissions.map((item) => item.role));
        return {
          action: permission.action,
          description: permission.description,
          roles: {
            [UserRole.ADMIN]: assignedRoles.has(UserRole.ADMIN),
            [UserRole.MANAGER]: assignedRoles.has(UserRole.MANAGER),
            [UserRole.REP]: assignedRoles.has(UserRole.REP),
            [UserRole.BOARDS]: assignedRoles.has(UserRole.BOARDS),
          },
        };
      }),
    };
  }

  // ============================================================
  // ۲. دریافت دسترسی‌های یک نقش
  // ============================================================
  async getRolePermissions(role: UserRole) {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role },
      include: { permission: true },
    });
    return rolePermissions.map((rp) => ({
      id: rp.id,
      action: rp.permission.action,
      description: rp.permission.description,
    }));
  }

  // ============================================================
  // ۳. اختصاص یک دسترسی به نقش
  // ============================================================
  async assignPermissionToRole(role: UserRole, action: string, actorId?: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { action },
    });
    if (!permission) {
      throw new NotFoundException('دسترسی پیدا نشد');
    }

    const existing = await this.prisma.rolePermission.findUnique({
      where: {
        role_permissionId: {
          role,
          permissionId: permission.id,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('این دسترسی قبلاً به این نقش اختصاص داده شده است');
    }

    const result = await this.prisma.rolePermission.create({
      data: {
        role,
        permissionId: permission.id,
      },
      include: { permission: true },
    });

    PermissionsGuard.clearCache(role);
    await this.audit.record({ actorId, entityType: 'permission', entityId: permission.id, action: 'permission.assigned', after: { role, action } });

    return {
      message: `دسترسی ${action} با موفقیت به نقش ${role} اختصاص یافت`,
      data: result,
    };
  }

  // ============================================================
  // ۴. حذف یک دسترسی از نقش
  // ============================================================
  async revokePermissionFromRole(role: UserRole, action: string, actorId?: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { action },
    });
    if (!permission) {
      throw new NotFoundException('دسترسی پیدا نشد');
    }

    const rolePermission = await this.prisma.rolePermission.findUnique({
      where: {
        role_permissionId: {
          role,
          permissionId: permission.id,
        },
      },
    });

    if (!rolePermission) {
      throw new NotFoundException('این دسترسی به این نقش اختصاص داده نشده است');
    }

    await this.prisma.rolePermission.delete({
      where: { id: rolePermission.id },
    });

    PermissionsGuard.clearCache(role);
    await this.audit.record({ actorId, entityType: 'permission', entityId: permission.id, action: 'permission.revoked', before: { role, action } });

    return {
      message: `دسترسی ${action} با موفقیت از نقش ${role} حذف شد`,
    };
  }

  // ============================================================
  // ۵. ایجاد دسترسی جدید
  // ============================================================
  async createPermission(action: string, description?: string) {
    const existing = await this.prisma.permission.findUnique({
      where: { action },
    });
    if (existing) {
      throw new BadRequestException('این دسترسی قبلاً وجود دارد');
    }

    return this.prisma.permission.create({
      data: { action, description },
    });
  }

  // ============================================================
  // ۶. حذف دسترسی (با احتیاط)
  // ============================================================
  async deletePermission(action: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { action },
      include: { rolePermissions: true },
    });

    if (!permission) {
      throw new NotFoundException('دسترسی پیدا نشد');
    }

    if (permission.rolePermissions.length > 0) {
      throw new BadRequestException(
        'این دسترسی به نقش‌هایی اختصاص داده شده است، ابتدا آن‌ها را حذف کنید',
      );
    }

    await this.prisma.permission.delete({
      where: { id: permission.id },
    });

    PermissionsGuard.clearCache();

    return {
      message: `دسترسی ${action} با موفقیت حذف شد`,
    };
  }

  // ============================================================
  // ✅ ۷. Bulk Assign Permissions به یک نقش
  // ============================================================
  async bulkAssignPermissionsToRole(role: UserRole, actions: string[], actorId?: string) {
    if (!actions || actions.length === 0) {
      throw new BadRequestException('حداقل یک دسترسی باید انتخاب شود');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { action: { in: actions } },
    });

    if (permissions.length !== actions.length) {
      const foundActions = permissions.map(p => p.action);
      const notFound = actions.filter(a => !foundActions.includes(a));
      throw new NotFoundException(`دسترسی‌های زیر یافت نشدند: ${notFound.join(', ')}`);
    }

    const existingRolePermissions = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permissionId: true },
    });
    const existingPermissionIds = new Set(existingRolePermissions.map(rp => rp.permissionId));

    const newPermissions = permissions.filter(p => !existingPermissionIds.has(p.id));

    if (newPermissions.length === 0) {
      throw new BadRequestException('همه دسترسی‌های انتخاب شده قبلاً به این نقش اختصاص داده شده‌اند');
    }

    const result = await this.prisma.$transaction(
      newPermissions.map(permission =>
        this.prisma.rolePermission.create({
          data: {
            role,
            permissionId: permission.id,
          },
        })
      )
    );

    PermissionsGuard.clearCache(role);
    await this.audit.record({ actorId, entityType: 'permission', action: 'permission.bulk_assigned', metadata: { role, actions: newPermissions.map((item) => item.action) } });

    return {
      message: `${result.length} دسترسی با موفقیت به نقش ${role} اختصاص یافت`,
      assigned: result.map(rp => ({
        id: rp.id,
        action: newPermissions.find(p => p.id === rp.permissionId)?.action,
      })),
      skipped: permissions.length - result.length,
    };
  }

  // ============================================================
  // ✅ ۸. Bulk Revoke Permissions از یک نقش
  // ============================================================
  async bulkRevokePermissionsFromRole(role: UserRole, actions: string[], actorId?: string) {
    if (!actions || actions.length === 0) {
      throw new BadRequestException('حداقل یک دسترسی باید انتخاب شود');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { action: { in: actions } },
    });

    if (permissions.length !== actions.length) {
      const foundActions = permissions.map(p => p.action);
      const notFound = actions.filter(a => !foundActions.includes(a));
      throw new NotFoundException(`دسترسی‌های زیر یافت نشدند: ${notFound.join(', ')}`);
    }

    const permissionIds = permissions.map(p => p.id);

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        role,
        permissionId: { in: permissionIds },
      },
    });

    if (rolePermissions.length === 0) {
      throw new BadRequestException('هیچکدام از دسترسی‌های انتخاب شده به این نقش اختصاص داده نشده‌اند');
    }

    const deleted = await this.prisma.rolePermission.deleteMany({
      where: {
        id: { in: rolePermissions.map(rp => rp.id) },
      },
    });

    PermissionsGuard.clearCache(role);
    await this.audit.record({ actorId, entityType: 'permission', action: 'permission.bulk_revoked', metadata: { role, actions: rolePermissions.map((rp) => permissions.find((p) => p.id === rp.permissionId)?.action).filter(Boolean) } });

    return {
      message: `${deleted.count} دسترسی با موفقیت از نقش ${role} حذف شد`,
      removed: rolePermissions.map(rp => ({
        action: permissions.find(p => p.id === rp.permissionId)?.action,
      })),
      skipped: actions.length - deleted.count,
    };
  }

  // ============================================================
  // ✅ ۹. دریافت وضعیت کامل دسترسی‌های یک نقش
  // ============================================================
  async getRolePermissionsWithDetails(role: UserRole) {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role },
      include: { permission: true },
    });

    const allPermissions = await this.prisma.permission.findMany({
      orderBy: { action: 'asc' },
    });

    const assignedActions = new Set(rolePermissions.map(rp => rp.permission.action));

    return {
      role,
      permissions: allPermissions.map(p => ({
        action: p.action,
        description: p.description,
        isAssigned: assignedActions.has(p.action),
      })),
      assignedCount: rolePermissions.length,
      totalCount: allPermissions.length,
    };
  }
}
