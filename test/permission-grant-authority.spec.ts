import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoleScope, UserRole } from '@prisma/client';
import { AdminPermissionsService } from '../src/admin/admin-permissions.service';
import { RbacManagementService } from '../src/admin/rbac-management.service';
import { TenantRbacService } from '../src/organization-memberships/tenant-rbac.service';

describe('Stage 5.4-B role-id permission authority', () => {
  const tenant = { organizationId: 'org-a', tenantId: 'org-a', userId: 'actor', membershipId: 'membership', role: UserRole.ADMIN, roleId: 'admin-role', roleCode: 'ADMIN', roleScope: RoleScope.SYSTEM, authorizationVersion: 1, permissions: [] } as any;

  function tenantHarness() {
    const tx: any = {
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-role', permissions: [{ permissionId: 'old' }] }) },
      permission: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) },
      rolePermission: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }), createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      organization: { update: jest.fn().mockResolvedValue({ id: 'org-a' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    return { tx, service: new TenantRbacService(prisma) };
  }

  it('creates tenant grants with roleId', async () => {
    const { tx, service } = tenantHarness();
    await service.replacePermissions('tenant-role', { permissionIds: ['p1', 'p2'] }, tenant, 'actor');
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({ data: [{ roleId: 'tenant-role', permissionId: 'p1' }, { roleId: 'tenant-role', permissionId: 'p2' }] });
  });

  it('does not fabricate enum roles for tenant grants', async () => {
    const { tx, service } = tenantHarness();
    await service.replacePermissions('tenant-role', { permissionIds: ['p1', 'p2'] }, tenant, 'actor');
    expect(tx.rolePermission.createMany.mock.calls[0][0].data.every((grant: any) => grant.role === undefined)).toBe(true);
  });

  it('revokes the previous tenant grants by roleId', async () => {
    const { tx, service } = tenantHarness();
    await service.replacePermissions('tenant-role', { permissionIds: ['p1', 'p2'] }, tenant, 'actor');
    expect(tx.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'tenant-role' } });
  });

  it('increments the tenant authorization version in the grant transaction', async () => {
    const { tx, service } = tenantHarness();
    await service.replacePermissions('tenant-role', { permissionIds: ['p1', 'p2'] }, tenant, 'actor');
    expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: 'org-a' }, data: { authorizationVersion: { increment: 1 } } });
  });

  function platformHarness() {
    const tx: any = {
      rolePermission: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }) => ({ id: 'grant', ...data })),
        delete: jest.fn().mockResolvedValue({ id: 'grant' }),
      },
      organization: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma: any = {
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'system-admin', baseRole: UserRole.ADMIN }) },
      permission: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', action: 'thing:read' }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit: any = { record: jest.fn().mockResolvedValue({}) };
    return { tx, prisma, service: new AdminPermissionsService(prisma, audit) };
  }

  it('resolves the SYSTEM Role and assigns through its id', async () => {
    const { tx, prisma, service } = platformHarness();
    await service.assignPermissionToRole(UserRole.ADMIN, 'thing:read');
    expect(prisma.role.findFirst).toHaveBeenCalledWith({ where: { baseRole: UserRole.ADMIN, scope: RoleScope.SYSTEM, organizationId: null, isActive: true }, select: { id: true, baseRole: true } });
    expect(tx.rolePermission.create).toHaveBeenCalledWith(expect.objectContaining({ data: { roleId: 'system-admin', role: UserRole.ADMIN, permissionId: 'p1' } }));
  });

  it('invalidates tenant authorization after a SYSTEM grant mutation', async () => {
    const { tx, service } = platformHarness();
    await service.assignPermissionToRole(UserRole.ADMIN, 'thing:read');
    expect(tx.organization.updateMany).toHaveBeenCalledWith({ data: { authorizationVersion: { increment: 1 } } });
  });

  it('revokes a SYSTEM grant using the roleId composite key', async () => {
    const { tx, service } = platformHarness();
    tx.rolePermission.findUnique.mockResolvedValue({ id: 'grant' });
    await service.revokePermissionFromRole(UserRole.ADMIN, 'thing:read');
    expect(tx.rolePermission.findUnique).toHaveBeenCalledWith({ where: { roleId_permissionId: { roleId: 'system-admin', permissionId: 'p1' } } });
    expect(tx.rolePermission.delete).toHaveBeenCalledWith({ where: { id: 'grant' } });
  });

  function catalogHarness() {
    const tx: any = {
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ roleId: 'tenant-role' }, { roleId: 'system-role' }]) },
      permission: {
        update: jest.fn().mockResolvedValue({ id: 'p1', action: 'thing:read', isActive: false }),
        delete: jest.fn().mockResolvedValue({ id: 'p1', action: 'thing:read' }),
      },
      role: { findMany: jest.fn().mockResolvedValue([
        { id: 'tenant-role', scope: RoleScope.TENANT, organizationId: 'org-owner' },
        { id: 'system-role', scope: RoleScope.SYSTEM, organizationId: null },
      ]) },
      organizationMembership: { findMany: jest.fn().mockResolvedValue([{ organizationId: 'org-member' }]) },
      organization: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma: any = {
      permission: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', action: 'thing:read', isSystem: false, isActive: true }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    return { tx, service: new RbacManagementService(prisma) };
  }

  it('invalidates tenant-role owners and SYSTEM-role member organizations on deactivation', async () => {
    const { tx, service } = catalogHarness();
    await service.updatePermission('p1', { isActive: false });
    expect(tx.organization.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['org-owner', 'org-member'] } }, data: { authorizationVersion: { increment: 1 } } });
  });

  it('invalidates affected tenants when deleting a permission', async () => {
    const { tx, service } = catalogHarness();
    await service.deletePermission('p1');
    expect(tx.permission.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(tx.organization.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['org-owner', 'org-member'] } }, data: { authorizationVersion: { increment: 1 } } });
  });

  it('has no enum-only RolePermission create in active runtime writers', () => {
    const files = [
      'src/admin/admin-permissions.service.ts',
      'src/admin/rbac-management.service.ts',
      'src/admin/tenant-roles.service.ts',
      'src/organization-memberships/tenant-rbac.service.ts',
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const writes = source.match(/rolePermission\.(?:create|createMany)\([\s\S]*?\}\);/g) ?? [];
      expect(writes.every((write) => write.includes('roleId'))).toBe(true);
    }
  });
});
