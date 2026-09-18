import { RoleScope } from '@prisma/client';
import { TenantRbacService } from '../src/organization-memberships/tenant-rbac.service';

const tenant = { organizationId: 'org-a', tenantId: 'org-a', userId: 'actor-a', membershipId: 'actor-membership', tenantRole: 'ADMIN', permissions: [], platformAdmin: false, membershipStatus: 'active' as const, resolutionSource: 'token-session' as const };

describe('TenantRbacService fix 000091', () => {
  it('creates a tenant-owned role and atomically versions and audits it', async () => {
    const tx: any = {
      role: { create: jest.fn().mockResolvedValue({ id: 'role-a', scope: RoleScope.TENANT, organizationId: 'org-a' }) },
      organization: { update: jest.fn() }, auditLog: { create: jest.fn() },
    };
    const prisma: any = { $transaction: (callback: any) => callback(tx) };
    const result = await new TenantRbacService(prisma).create({ code: 'SALES', name: 'Sales' }, tenant, 'actor-a');
    expect(result).toMatchObject({ scope: RoleScope.TENANT, organizationId: 'org-a' });
    expect(tx.role.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ normalizedCode: 'SALES', scope: RoleScope.TENANT, organizationId: 'org-a' }) }));
    expect(tx.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { authorizationVersion: { increment: 1 } } }));
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('fails closed when assigning a role outside the active system/same-tenant set', async () => {
    const tx: any = {
      organizationMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'member-a', roleId: null }), update: jest.fn() },
      role: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = { $transaction: (callback: any) => callback(tx) };
    await expect(new TenantRbacService(prisma).assign('member-a', { roleId: 'foreign-role' }, tenant, 'actor-a')).rejects.toThrow('Role not found');
    expect(tx.role.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'foreign-role', OR: expect.arrayContaining([{ scope: RoleScope.TENANT, organizationId: 'org-a' }]) }) });
    expect(tx.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('does not permit tenant mutation of a system role', async () => {
    const tx: any = { role: { findFirst: jest.fn().mockResolvedValue(null) } };
    const prisma: any = { $transaction: (callback: any) => callback(tx) };
    await expect(new TenantRbacService(prisma).update('system-role', { name: 'changed' }, tenant, 'actor-a')).rejects.toThrow('Role not found');
    expect(tx.role.findFirst).toHaveBeenCalledWith({ where: { id: 'system-role', scope: RoleScope.TENANT, organizationId: 'org-a' } });
  });
});
