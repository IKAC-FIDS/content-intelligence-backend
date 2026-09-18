import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleScope, UserRole } from '@prisma/client';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManagedPermissionDto, CreateRoleDto, ReplaceRolePermissionsDto, UpdateManagedPermissionDto, UpdateRoleDto } from './dto/rbac-management.dto';

const ADMIN_REQUIRED = ['permission:manage', 'role:manage'];
@Injectable()
export class RbacManagementService {
  constructor(private readonly prisma: PrismaService) {}
  permissions() { return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { action: 'asc' }] }); }
  async permission(id: string) { const item = await this.prisma.permission.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Permission not found'); return item; }
  async createPermission(dto: CreateManagedPermissionDto) { try { return await this.prisma.permission.create({ data: { ...dto, isSystem: false, isActive: dto.isActive ?? true } }); } catch { throw new ConflictException('Permission action already exists'); } }
  async updatePermission(id: string, dto: UpdateManagedPermissionDto) { const current = await this.permission(id); if (current.isSystem && dto.action && dto.action !== current.action) throw new ForbiddenException('System permission action cannot be changed'); if (current.isSystem && ADMIN_REQUIRED.includes(current.action) && dto.isActive === false) throw new ForbiddenException('Critical RBAC permissions cannot be deactivated'); try { const updated = await this.prisma.permission.update({ where: { id }, data: dto }); PermissionsGuard.clearCache(); return updated; } catch { throw new ConflictException('Permission action already exists'); } }
  async deletePermission(id: string) { const current = await this.permission(id); if (current.isSystem) throw new ForbiddenException('System permissions cannot be deleted'); const assigned = await this.prisma.rolePermission.count({ where: { permissionId: id } }); if (assigned) throw new ConflictException('Permission is assigned to one or more roles'); return this.prisma.permission.delete({ where: { id } }); }

  roles() { return this.prisma.role.findMany({ include: { _count: { select: { users: true, permissions: true } } }, orderBy: { code: 'asc' } }); }
  async role(id: string) { const item = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } }); if (!item) throw new NotFoundException('Role not found'); return item; }
  async createRole(_dto: CreateRoleDto) { throw new ForbiddenException('Create roles through the tenant-scoped role API'); }
  async updateRole(id: string, dto: UpdateRoleDto) { const current = await this.role(id); if (current.scope === RoleScope.SYSTEM) throw new ForbiddenException('System role definitions are operator controlled'); return this.prisma.role.update({ where: { id }, data: dto }); }
  async deleteRole(id: string) { const current = await this.role(id); if (current.scope === RoleScope.SYSTEM) throw new ForbiddenException('System roles cannot be deleted'); if (current._count.users) throw new ConflictException('Role is assigned to users'); const membershipCount = await this.prisma.organizationMembership.count({ where: { roleId: id } }); if (membershipCount) throw new ConflictException('Role is assigned to organization memberships'); return this.prisma.role.delete({ where: { id } }); }
  async rolePermissions(id: string) { const role = await this.role(id); const permissions = await this.prisma.permission.findMany({ where: { isActive: true }, orderBy: { action: 'asc' } }); const assigned = new Set(role.permissions.map((item) => item.permissionId)); return { role: { id: role.id, code: role.code, name: role.name }, assignedPermissionIds: [...assigned], assignedActions: role.permissions.map((item) => item.permission.action), permissions: permissions.map((item) => ({ ...item, assigned: assigned.has(item.id) })) }; }
  async replaceRolePermissions(id: string, dto: ReplaceRolePermissionsDto) {
    const role = await this.role(id); if (role.scope === RoleScope.SYSTEM) throw new ForbiddenException('System role definitions are operator controlled'); const permissions = await this.prisma.permission.findMany({ where: { id: { in: dto.permissionIds }, isActive: true } });
    if (permissions.length !== dto.permissionIds.length) throw new BadRequestException('One or more permissions do not exist or are inactive');
    const actions = new Set(permissions.map((item) => item.action));
    if (role.code === UserRole.ADMIN && ADMIN_REQUIRED.some((action) => !actions.has(action))) throw new ForbiddenException('ADMIN must retain permission:manage and role:manage');
    await this.prisma.$transaction(async (tx) => { await tx.rolePermission.deleteMany({ where: { roleId: id } }); await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: id, role: role.isSystem ? role.baseRole : null, permissionId: permission.id })) }); });
    PermissionsGuard.clearCache(role.baseRole); PermissionsGuard.clearCache(`role:${id}`); return this.rolePermissions(id);
  }
}
