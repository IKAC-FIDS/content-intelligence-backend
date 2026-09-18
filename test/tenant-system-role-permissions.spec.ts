import { ForbiddenException } from '@nestjs/common';
import { RoleScope, UserRole } from '@prisma/client';
import { TenantRolesService } from '../src/admin/tenant-roles.service';

const tenant = {
  organizationId: 'org-a',
  tenantId: 'org-a',
  userId: 'actor-a',
} as any;

describe('TenantRolesService system role permissions', () => {
  const systemRole = {
    id: 'admin-role',
    code: 'ADMIN',
    name: 'Admin',
    scope: RoleScope.SYSTEM,
    baseRole: UserRole.ADMIN,
    permissions: [],
    _count: { users: 1, permissions: 0, organizationMemberships: 1 },
  };

  it('allows a role manager to replace permissions on a system role', async () => {
    const permissions = [
      { id: 'p1', action: 'permission:manage' },
      { id: 'p2', action: 'role:manage' },
      { id: 'p3', action: 'user:view' },
    ];
    const tx = {
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      organization: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma: any = {
      role: { findFirst: jest.fn().mockResolvedValue(systemRole) },
      permission: { findMany: jest.fn().mockResolvedValue(permissions) },
      $transaction: (callback: any) => callback(tx),
    };
    const service = new TenantRolesService(prisma);
    jest.spyOn(service, 'permissions').mockResolvedValue({ ok: true } as any);

    await expect(
      service.replacePermissions('admin-role', { permissionIds: ['p1', 'p2', 'p3'] }, tenant),
    ).resolves.toEqual({ ok: true });
    expect(tx.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ roleId: 'admin-role' }, { role: UserRole.ADMIN }] },
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: permissions.map((permission) => ({
        roleId: 'admin-role',
        role: UserRole.ADMIN,
        permissionId: permission.id,
      })),
    });
    expect(tx.organization.updateMany).toHaveBeenCalledWith({
      where: {},
      data: { authorizationVersion: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorId: 'actor-a',
        action: 'tenant-role.permissions-replaced',
      }),
    }));
  });

  it('keeps critical ADMIN permissions protected', async () => {
    const prisma: any = {
      role: { findFirst: jest.fn().mockResolvedValue(systemRole) },
      permission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p3', action: 'user:view' }]),
      },
    };
    const service = new TenantRolesService(prisma);
    await expect(
      service.replacePermissions('admin-role', { permissionIds: ['p3'] }, tenant),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
