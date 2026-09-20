import { OrganizationMembershipStatus, RoleScope, UserRole } from '@prisma/client';
import { TenantRbacMaintenance } from '../src/organization-memberships/tenant-rbac-maintenance';

const permissionGrants = (actions: string[]) => actions.map((action) => ({ permission: { action } }));
const role = (overrides: Record<string, unknown> = {}) => ({
  id: 'role-a', baseRole: UserRole.REP, isActive: true, scope: RoleScope.SYSTEM,
  organizationId: null, permissions: permissionGrants(['read']), ...overrides,
});
const membership = (overrides: Record<string, unknown> = {}) => ({
  id: 'membership-a', userId: 'user-a', organizationId: 'org-a', roleId: 'role-a',
  status: OrganizationMembershipStatus.ACTIVE, isTenantOwner: false,
  user: {
    id: 'user-a', role: UserRole.REP, roleId: 'role-a', isActive: true,
    assignedRole: role(),
  },
  role: role(),
  ...overrides,
});

function setup(rows: any[], roles: any[] = [role()], enumActions: Partial<Record<UserRole, string[]>> = { REP: ['read'] }, membershipCount = 1, platformUserIds: string[] = []) {
  const tx: any = { organizationMembership: { updateMany: jest.fn() }, organization: { update: jest.fn() }, auditLog: { create: jest.fn() } };
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-a', authorizationVersion: 1 }) },
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue(rows),
      groupBy: jest.fn().mockResolvedValue([...new Set(rows.map((row) => row.userId))].map((userId) => ({ userId, _count: { _all: membershipCount } }))),
      count: jest.fn().mockResolvedValue(0),
    },
    role: { findMany: jest.fn().mockResolvedValue(roles), count: jest.fn().mockResolvedValue(0) },
    rolePermission: { findMany: jest.fn().mockResolvedValue(Object.entries(enumActions).flatMap(([legacyRole, actions]) => (actions ?? []).map((action) => ({ role: legacyRole, permission: { action } })))) },
    platformAuthority: { findMany: jest.fn().mockResolvedValue(platformUserIds.map((userId) => ({ userId }))) },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  return { prisma, tx, service: new TenantRbacMaintenance(prisma) };
}

describe('Stage 5.4-E RBAC migration readiness audit', () => {
  it('reports an exact independently calculated permission match', async () => {
    const report = await setup([membership()]).service.plan('org-a');
    expect(report.audits[0]).toMatchObject({ status: 'EXACT_MATCH', legacyPermissions: ['read'], roleIdPermissions: ['read'], legacyOnly: [], roleIdOnly: [] });
    expect(report.audits[0].diagnostics).toContain('PERMISSIONS_MATCH');
  });

  it('reports legacy-only privilege', async () => {
    const row = membership({ user: { ...membership().user, roleId: null, assignedRole: null } });
    const report = await setup([row], [role()], { REP: ['read', 'write'] }).service.plan('org-a');
    expect(report.audits[0]).toMatchObject({ status: 'PERMISSION_SETS_DIVERGE', legacyOnly: ['write'], roleIdOnly: [] });
    expect(report.audits[0].diagnostics).toContain('LEGACY_HAS_EXTRA_PERMISSIONS');
  });

  it('reports roleId-only privilege', async () => {
    const row = membership({ user: { ...membership().user, roleId: null, assignedRole: null }, role: role({ permissions: permissionGrants(['read', 'write']) }) });
    const report = await setup([row], [role()], { REP: ['read'] }).service.plan('org-a');
    expect(report.audits[0].roleIdOnly).toEqual(['write']);
    expect(report.audits[0].diagnostics).toContain('ROLE_ID_HAS_EXTRA_PERMISSIONS');
  });

  it('reports completely divergent permission sets without unioning them', async () => {
    const row = membership({ user: { ...membership().user, roleId: null, assignedRole: null }, role: role({ permissions: permissionGrants(['target']) }) });
    const audit = (await setup([row], [role()], { REP: ['legacy'] }).service.plan('org-a')).audits[0];
    expect(audit).toMatchObject({ legacyPermissions: ['legacy'], roleIdPermissions: ['target'], legacyOnly: ['legacy'], roleIdOnly: ['target'] });
    expect(audit.diagnostics).toContain('PERMISSION_SETS_DIVERGE');
  });

  it.each([
    ['ROLE_ASSIGNMENT_MISSING', membership({ roleId: null, role: null, user: { ...membership().user, roleId: null, assignedRole: null } })],
    ['ROLE_INACTIVE', membership({ role: role({ isActive: false }) })],
    ['ROLE_CROSS_TENANT', membership({ role: role({ scope: RoleScope.TENANT, organizationId: 'org-b' }) })],
  ])('reports %s structural state', async (status, row) => {
    const audit = (await setup([row as any]).service.plan('org-a')).audits[0];
    expect(audit.status).toBe(status);
  });

  it('accepts a structurally valid SYSTEM role', async () => {
    expect((await setup([membership()]).service.plan('org-a')).audits[0].status).toBe('EXACT_MATCH');
  });

  it('classifies a valid same-tenant custom role as having no legacy equivalent', async () => {
    const custom = role({ id: 'custom', scope: RoleScope.TENANT, organizationId: 'org-a', baseRole: UserRole.REP });
    const row = membership({ roleId: 'custom', role: custom, user: { ...membership().user, roleId: null, assignedRole: null } });
    const audit = (await setup([row], [custom]).service.plan('org-a')).audits[0];
    expect(audit.status).toBe('CUSTOM_ROLE');
    expect(audit.diagnostics).toEqual(expect.arrayContaining(['CUSTOM_ROLE', 'NO_LEGACY_EQUIVALENT']));
  });

  it('flags multi-tenant ambiguity and keeps each membership authoritative', async () => {
    const row = membership({ user: { ...membership().user, roleId: 'global-role', assignedRole: role({ id: 'global-role' }) } });
    const audit = (await setup([row], [role()], { REP: ['read'] }, 2).service.plan('org-a')).audits[0];
    expect(audit.membershipRoleId).toBe('role-a');
    expect(audit.diagnostics).toEqual(expect.arrayContaining(['MULTI_TENANT_LEGACY_AMBIGUITY', 'LEGACY_ROLE_ID_DIFFERENT']));
  });

  it('flags an owner with a missing role and missing management permissions', async () => {
    const row = membership({ roleId: null, role: null, isTenantOwner: true, user: { ...membership().user, roleId: null, assignedRole: null } });
    const audit = (await setup([row], [], { REP: [] }).service.plan('org-a')).audits[0];
    expect(audit.diagnostics).toEqual(expect.arrayContaining(['OWNER_WITHOUT_USABLE_ROLE', 'OWNER_MANAGEMENT_PERMISSIONS_UNVERIFIED']));
    expect(audit.ownerMissingPermissions).toEqual(['role:manage', 'user:manage']);
  });

  it('does not infer PLATFORM_ADMIN from tenant ADMIN', async () => {
    const adminRole = role({ baseRole: UserRole.ADMIN });
    const row = membership({ role: adminRole, user: { ...membership().user, role: UserRole.ADMIN, assignedRole: adminRole } });
    const report = await setup([row], [adminRole], { ADMIN: ['read'] }).service.plan('org-a');
    expect(report.platformAuthorityInference).toBe(false);
    expect(report.audits[0].diagnostics).toContain('TENANT_ADMIN_WITHOUT_PLATFORM_AUTHORITY');
  });

  it('dry-run performs zero writes and reports ambiguity instead of reconciliation', async () => {
    const missing = membership({ roleId: null, role: null, user: { ...membership().user, roleId: null, assignedRole: null } });
    const duplicateRoles = [role({ id: 'rep-one' }), role({ id: 'rep-two' })];
    const { prisma, tx, service } = setup([missing], duplicateRoles);
    const report = await service.backfill('org-a', false);
    expect(report.mode).toBe('dry-run');
    expect(report.audits[0].diagnostics).toContain('AMBIGUOUS_ROLE_RECONCILIATION');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.organizationMembership.updateMany).not.toHaveBeenCalled();
  });
});
