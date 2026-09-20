import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleScope, UserRole } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { incrementAuthorizationVersionsForRoleIds } from './authorization-version';

@Injectable()
export class AdminPermissionsService {
  constructor(private prisma: PrismaService, private audit: AuditLogService) {}

  getAllPermissions() { return this.prisma.permission.findMany({ orderBy: { action: 'asc' } }); }

  async getPermissionMatrix() {
    const roles = Object.values(UserRole);
    const permissions = await this.prisma.permission.findMany({ orderBy: { action: 'asc' }, include: { rolePermissions: { select: { role: true } } } });
    return { roles, permissions: permissions.map((permission) => {
      const assigned = new Set(permission.rolePermissions.map((item) => item.role));
      return { action: permission.action, description: permission.description, roles: Object.fromEntries(roles.map((role) => [role, assigned.has(role)])) };
    }) };
  }

  async getRolePermissions(role: UserRole) {
    const systemRole = await this.systemRole(role);
    const grants = await this.prisma.rolePermission.findMany({ where: { roleId: systemRole.id }, include: { permission: true } });
    return grants.map((grant) => ({ id: grant.id, action: grant.permission.action, description: grant.permission.description }));
  }

  async assignPermissionToRole(role: UserRole, action: string, actorId?: string) {
    const [permission, systemRole] = await Promise.all([this.prisma.permission.findUnique({ where: { action } }), this.systemRole(role)]);
    if (!permission) throw new NotFoundException('دسترسی پیدا نشد');
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: systemRole.id, permissionId: permission.id } } });
      if (existing) throw new BadRequestException('این دسترسی قبلاً به این نقش اختصاص داده شده است');
      const created = await tx.rolePermission.create({ data: { roleId: systemRole.id, role, permissionId: permission.id }, include: { permission: true } });
      await tx.organization.updateMany({ data: { authorizationVersion: { increment: 1 } } });
      return created;
    });
    this.clearRoleCaches(role, systemRole.id);
    await this.audit.record({ actorId, entityType: 'permission', entityId: permission.id, action: 'permission.assigned', after: { role, roleId: systemRole.id, permissionAction: action } });
    return { message: `دسترسی ${action} با موفقیت به نقش ${role} اختصاص یافت`, data: result };
  }

  async revokePermissionFromRole(role: UserRole, action: string, actorId?: string) {
    const [permission, systemRole] = await Promise.all([this.prisma.permission.findUnique({ where: { action } }), this.systemRole(role)]);
    if (!permission) throw new NotFoundException('دسترسی پیدا نشد');
    await this.prisma.$transaction(async (tx) => {
      const grant = await tx.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: systemRole.id, permissionId: permission.id } } });
      if (!grant) throw new NotFoundException('این دسترسی به این نقش اختصاص داده نشده است');
      await tx.rolePermission.delete({ where: { id: grant.id } });
      await tx.organization.updateMany({ data: { authorizationVersion: { increment: 1 } } });
    });
    this.clearRoleCaches(role, systemRole.id);
    await this.audit.record({ actorId, entityType: 'permission', entityId: permission.id, action: 'permission.revoked', before: { role, roleId: systemRole.id, permissionAction: action } });
    return { message: `دسترسی ${action} با موفقیت از نقش ${role} حذف شد` };
  }

  async createPermission(action: string, description?: string) {
    if (await this.prisma.permission.findUnique({ where: { action } })) throw new BadRequestException('این دسترسی قبلاً وجود دارد');
    return this.prisma.permission.create({ data: { action, description } });
  }

  async deletePermission(action: string) {
    const permission = await this.prisma.permission.findUnique({ where: { action } });
    if (!permission) throw new NotFoundException('دسترسی پیدا نشد');
    await this.prisma.$transaction(async (tx) => {
      const grants = await tx.rolePermission.findMany({ where: { permissionId: permission.id, roleId: { not: null } }, select: { roleId: true } });
      await tx.permission.delete({ where: { id: permission.id } });
      await incrementAuthorizationVersionsForRoleIds(tx, grants.map((grant) => grant.roleId));
    });
    PermissionsGuard.clearCache();
    return { message: `دسترسی ${action} با موفقیت حذف شد` };
  }

  async bulkAssignPermissionsToRole(role: UserRole, actions: string[], actorId?: string) {
    if (!actions?.length) throw new BadRequestException('حداقل یک دسترسی باید انتخاب شود');
    const [permissions, systemRole] = await Promise.all([this.prisma.permission.findMany({ where: { action: { in: actions } } }), this.systemRole(role)]);
    this.assertAllPermissionsFound(actions, permissions);
    const existing = await this.prisma.rolePermission.findMany({ where: { roleId: systemRole.id, permissionId: { in: permissions.map((permission) => permission.id) } }, select: { permissionId: true } });
    const existingIds = new Set(existing.map((grant) => grant.permissionId));
    const additions = permissions.filter((permission) => !existingIds.has(permission.id));
    if (!additions.length) throw new BadRequestException('همه دسترسی‌های انتخاب شده قبلاً به این نقش اختصاص داده شده‌اند');
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.createMany({ data: additions.map((permission) => ({ roleId: systemRole.id, role, permissionId: permission.id })) });
      await tx.organization.updateMany({ data: { authorizationVersion: { increment: 1 } } });
    });
    this.clearRoleCaches(role, systemRole.id);
    await this.audit.record({ actorId, entityType: 'permission', action: 'permission.bulk_assigned', metadata: { role, roleId: systemRole.id, actions: additions.map((item) => item.action) } });
    return { message: `${additions.length} دسترسی با موفقیت به نقش ${role} اختصاص یافت`, assigned: additions.map((permission) => ({ id: permission.id, action: permission.action })), skipped: permissions.length - additions.length };
  }

  async bulkRevokePermissionsFromRole(role: UserRole, actions: string[], actorId?: string) {
    if (!actions?.length) throw new BadRequestException('حداقل یک دسترسی باید انتخاب شود');
    const [permissions, systemRole] = await Promise.all([this.prisma.permission.findMany({ where: { action: { in: actions } } }), this.systemRole(role)]);
    this.assertAllPermissionsFound(actions, permissions);
    const grants = await this.prisma.rolePermission.findMany({ where: { roleId: systemRole.id, permissionId: { in: permissions.map((permission) => permission.id) } } });
    if (!grants.length) throw new BadRequestException('هیچکدام از دسترسی‌های انتخاب شده به این نقش اختصاص داده نشده‌اند');
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.rolePermission.deleteMany({ where: { id: { in: grants.map((grant) => grant.id) } } });
      await tx.organization.updateMany({ data: { authorizationVersion: { increment: 1 } } });
      return result;
    });
    this.clearRoleCaches(role, systemRole.id);
    await this.audit.record({ actorId, entityType: 'permission', action: 'permission.bulk_revoked', metadata: { role, roleId: systemRole.id, actions } });
    return { message: `${deleted.count} دسترسی با موفقیت از نقش ${role} حذف شد`, removed: grants.map((grant) => ({ action: permissions.find((permission) => permission.id === grant.permissionId)?.action })), skipped: actions.length - deleted.count };
  }

  async getRolePermissionsWithDetails(role: UserRole) {
    const systemRole = await this.systemRole(role);
    const [grants, permissions] = await Promise.all([this.prisma.rolePermission.findMany({ where: { roleId: systemRole.id }, include: { permission: true } }), this.prisma.permission.findMany({ orderBy: { action: 'asc' } })]);
    const assigned = new Set(grants.map((grant) => grant.permission.action));
    return { role, permissions: permissions.map((permission) => ({ action: permission.action, description: permission.description, isAssigned: assigned.has(permission.action) })), assignedCount: grants.length, totalCount: permissions.length };
  }

  private async systemRole(baseRole: UserRole) {
    const role = await this.prisma.role.findFirst({ where: { baseRole, scope: RoleScope.SYSTEM, organizationId: null, isActive: true }, select: { id: true, baseRole: true } });
    if (!role) throw new NotFoundException('نقش سیستمی پیدا نشد');
    return role;
  }

  private assertAllPermissionsFound(actions: string[], permissions: Array<{ action: string }>) {
    if (permissions.length === actions.length) return;
    const found = new Set(permissions.map((permission) => permission.action));
    throw new NotFoundException(`دسترسی‌های زیر یافت نشدند: ${actions.filter((action) => !found.has(action)).join(', ')}`);
  }

  private clearRoleCaches(role: UserRole, roleId: string) {
    PermissionsGuard.clearCache(role);
    PermissionsGuard.clearCache(`role:${roleId}`);
  }
}
