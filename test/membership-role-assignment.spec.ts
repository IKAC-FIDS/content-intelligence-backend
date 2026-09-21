import { BadRequestException } from '@nestjs/common';
import { RoleScope, UserRole } from '@prisma/client';
import { resolveMembershipRole } from '../src/organization-memberships/membership-role-assignment';
import { UsersService } from '../src/users/users.service';

const actor: any = {
  userId: 'admin-user',
  role: UserRole.ADMIN,
  tenantContext: {
    tenantId: 'org-a', organizationId: 'org-a', userId: 'admin-user', membershipId: 'membership-admin',
    role: UserRole.ADMIN, roleId: 'system-admin', roleCode: 'ADMIN', roleScope: RoleScope.SYSTEM,
    authorizationVersion: 1, requestId: 'request-1', permissions: ['user:manage'],
    membershipStatus: 'active', resolutionSource: 'token-session',
    tenantRole: UserRole.ADMIN, platformAdmin: false,
  },
};

function usersHarness(roleLookup: any) {
  const memberships: any = {
    createInitialMembership: jest.fn().mockResolvedValue({ id: 'membership-a' }),
    syncRoleAssignment: jest.fn().mockResolvedValue({ id: 'membership-a' }),
    replaceTeams: jest.fn().mockResolvedValue(undefined),
  };
  const tx: any = {
    role: { findFirst: jest.fn(), findMany: jest.fn() },
    rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      create: jest.fn(({ data }) => ({ id: 'user-a', createdAt: new Date(), lastLoginAt: null, teamId: null, ...data })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-a' }),
      update: jest.fn().mockResolvedValue({ id: 'user-a', role: UserRole.MANAGER, roleId: 'role-next' }),
    },
    organization: { update: jest.fn().mockResolvedValue({ id: 'org-a' }) },
  };
  if (roleLookup.mode === 'id') tx.role.findFirst.mockResolvedValue(roleLookup.value);
  else tx.role.findMany.mockResolvedValue(roleLookup.value);
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(tx)),
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue({
        roleId: 'old-role',
        teamId: null,
        team: null,
        user: {
          id: 'user-a',
          organizationId: 'legacy-org',
          role: UserRole.REP,
          roleId: 'old-role',
          assignedRole: null,
          teamId: null,
          team: null,
          ownedCompanies: [],
        },
      }),
    },
  };
  const audit: any = { record: jest.fn().mockResolvedValue({}) };
  const quota: any = { reserve: jest.fn().mockResolvedValue({ reservationId: 'reservation' }), commitReservation: jest.fn(), releaseReservation: jest.fn() };
  const profile: any = {};
  return { tx, prisma, memberships, service: new UsersService(prisma, audit, memberships, quota, profile) };
}

describe('Stage 5.4-C membership role assignment', () => {
  it('creates a tenant user with a non-null membership role resolved from legacy UserRole', async () => {
    const role = { id: 'system-rep', code: 'REP', name: 'Rep', baseRole: UserRole.REP, isSystem: true, isActive: true, scope: RoleScope.SYSTEM, organizationId: null };
    const { service, memberships, tx } = usersHarness({ mode: 'legacy', value: [role] });
    const result = await service.create({ fullName: 'User', email: 'user@example.test', password: 'secret1', role: UserRole.REP }, actor);
    expect(memberships.createInitialMembership).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'system-rep', null);
    expect(tx.user.create.mock.calls[0][0].data).not.toHaveProperty('role');
    expect(tx.user.create.mock.calls[0][0].data).not.toHaveProperty('roleId');
    expect(result).toMatchObject({
      role: UserRole.REP,
      roleId: 'system-rep',
      assignedRole: { id: 'system-rep', code: 'REP' },
    });
  });

  it('fails closed when the legacy SYSTEM role is missing', async () => {
    const { service, memberships } = usersHarness({ mode: 'legacy', value: [] });
    await expect(service.create({ fullName: 'User', email: 'user@example.test', password: 'secret1', role: UserRole.REP }, actor)).rejects.toThrow('Exactly one active SYSTEM REP role is required');
    expect(memberships.createInitialMembership).not.toHaveBeenCalled();
  });

  it('accepts an active SYSTEM role id', async () => {
    const tx: any = { role: { findFirst: jest.fn().mockResolvedValue({ id: 'system-role', baseRole: UserRole.ADMIN, scope: RoleScope.SYSTEM, organizationId: null }) } };
    await expect(resolveMembershipRole(tx, 'org-a', { roleId: 'system-role' })).resolves.toMatchObject({ id: 'system-role' });
    expect(tx.role.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'system-role', isActive: true }) }));
  });

  it('accepts an active same-tenant TENANT role id', async () => {
    const tx: any = { role: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-role', baseRole: UserRole.MANAGER, scope: RoleScope.TENANT, organizationId: 'org-a' }) } };
    await expect(resolveMembershipRole(tx, 'org-a', { roleId: 'tenant-role' })).resolves.toMatchObject({ id: 'tenant-role' });
  });

  it.each(['cross-tenant', 'inactive'])('rejects a %s role id', async () => {
    const tx: any = { role: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(resolveMembershipRole(tx, 'org-a', { roleId: 'invalid-role' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the intended Membership without mirroring Role into global User fields', async () => {
    const role = { id: 'role-next', code: 'TEAM_MANAGER', name: 'Team Manager', baseRole: UserRole.MANAGER, isSystem: false, isActive: true, scope: RoleScope.TENANT, organizationId: 'org-a' };
    const { service, memberships, tx } = usersHarness({ mode: 'id', value: role });
    const order: string[] = [];
    memberships.syncRoleAssignment.mockImplementation(async () => { order.push('membership'); });
    const result = await service.updateUserRole('user-a', { roleId: 'role-next' }, actor);
    expect(memberships.syncRoleAssignment).toHaveBeenCalledWith(tx, 'user-a', 'org-a', 'role-next');
    expect(order).toEqual(['membership']);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      role: UserRole.MANAGER,
      roleId: 'role-next',
      assignedRole: { id: 'role-next', code: 'TEAM_MANAGER' },
    });
  });

  it('does not update a second tenant membership when Tenant A role changes', async () => {
    const role = { id: 'role-a', code: 'TENANT_REP', name: 'Tenant Rep', baseRole: UserRole.REP, isSystem: false, isActive: true, scope: RoleScope.TENANT, organizationId: 'org-a' };
    const { service, memberships, prisma } = usersHarness({ mode: 'id', value: role });
    await service.updateUserRole('user-a', { roleId: 'role-a' }, actor);
    expect(memberships.syncRoleAssignment).toHaveBeenCalledTimes(1);
    expect(memberships.syncRoleAssignment.mock.calls[0][2]).toBe('org-a');
    expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: { userId: 'user-a', organizationId: 'org-a' },
        },
      }),
    );
  });
});
