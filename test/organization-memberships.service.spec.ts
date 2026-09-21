import { ForbiddenException } from '@nestjs/common';
import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  UserRole,
} from '@prisma/client';
import { OrganizationMembershipsService } from '../src/organization-memberships/organization-memberships.service';

const user = {
  id: 'user-1',
  organizationId: 'org-legacy',
  role: UserRole.REP,
  roleId: 'role-legacy',
  team: 'legacy-team',
  teamId: 'team-legacy',
  isActive: true,
};

const membership = (overrides: Record<string, unknown> = {}) => ({
  id: 'membership-1',
  userId: user.id,
  organizationId: 'org-1',
  roleId: 'role-1',
  teamId: 'team-1',
  status: OrganizationMembershipStatus.ACTIVE,
  isDefault: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  organization: { status: OrganizationStatus.ACTIVE },
  role: {
    id: 'role-1',
    code: 'CONTENT_MANAGER',
    baseRole: UserRole.MANAGER,
    isActive: true,
  },
  team: {
    id: 'team-1',
    code: 'TEAM_ONE',
    name: 'Team One',
    isActive: true,
    organizationId: 'org-1',
  },
  ...overrides,
});

function setup(rows: any[] = [membership()]) {
  const prisma = {
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn(),
    },
  };
  return { prisma, service: new OrganizationMembershipsService(prisma as any) };
}

describe('OrganizationMembershipsService effective context', () => {
  it('prefers the unique active default Membership', async () => {
    const { service } = setup();
    await expect(service.resolveEffectiveContext(user)).resolves.toMatchObject({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      role: 'CONTENT_MANAGER',
      roleId: 'role-1',
      teamId: 'team-1',
      source: 'authenticated-membership',
    });
  });

  it('selects the only active Membership when no default exists', async () => {
    const { service } = setup([membership({ isDefault: false })]);
    await expect(service.resolveEffectiveContext(user)).resolves.toMatchObject({
      membershipId: 'membership-1',
    });
  });

  it('does not use the global User organization to resolve ambiguous Memberships', async () => {
    const { service } = setup([
      membership({ id: 'other', organizationId: 'org-other', isDefault: false, team: null, teamId: null }),
      membership({ id: 'legacy-match', organizationId: 'org-legacy', isDefault: false, team: null, teamId: null }),
    ]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'Tenant selection is required',
    );
  });

  it('fails closed when multiple active Memberships remain ambiguous', async () => {
    const { service } = setup([
      membership({ id: 'a', organizationId: 'org-a', isDefault: false, team: null, teamId: null }),
      membership({ id: 'b', organizationId: 'org-b', isDefault: false, team: null, teamId: null }),
    ]);
    await expect(service.resolveEffectiveContext(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('fails closed when corrupted data contains multiple active defaults', async () => {
    const { service } = setup([
      membership({ id: 'a', organizationId: 'org-a' }),
      membership({ id: 'b', organizationId: 'org-b' }),
    ]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'Ambiguous active organization memberships',
    );
  });

  it.each([
    OrganizationMembershipStatus.INVITED,
    OrganizationMembershipStatus.SUSPENDED,
  ])('does not authorize %s Memberships', async (status) => {
    const { service } = setup([membership({ status })]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'No active organization membership',
    );
  });

  it('does not authorize a Membership for a suspended Organization', async () => {
    const { service } = setup([
      membership({ organization: { status: OrganizationStatus.SUSPENDED } }),
    ]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'No active organization membership',
    );
  });

  it('does not authorize global User fields when no Membership exists', async () => {
    const { service } = setup([]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'No active organization membership',
    );
  });

  it('requires an active roleId-backed Membership Role', async () => {
    const { service } = setup([membership({ roleId: null, role: null })]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'Membership role is required',
    );
  });

  it('rejects a Team from another Organization', async () => {
    const { service } = setup([
      membership({ team: { ...membership().team, organizationId: 'org-other' } }),
    ]);
    await expect(service.resolveEffectiveContext(user)).rejects.toThrow(
      'another organization',
    );
  });
});
