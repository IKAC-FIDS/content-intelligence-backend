import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  UserRole,
} from '@prisma/client';
import { TenantResolverService } from '../src/organization-memberships/tenant-resolver.service';

const user = { id: 'user-a', isActive: true, role: UserRole.REP };

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-a',
    userId: user.id,
    organizationId: 'org-a',
    roleId: 'role-a',
    teamId: 'team-a',
    status: OrganizationMembershipStatus.ACTIVE,
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    organization: { id: 'org-a', status: OrganizationStatus.ACTIVE },
    role: { id: 'role-a', baseRole: UserRole.MANAGER, isActive: true },
    team: {
      id: 'team-a',
      code: 'TEAM_A',
      name: 'Team A',
      isActive: true,
      organizationId: 'org-a',
    },
    ...overrides,
  };
}

function setup() {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(membership()),
      findMany: jest.fn().mockResolvedValue([membership()]),
    },
    rolePermission: {
      findMany: jest.fn().mockResolvedValue([
        { permission: { action: 'company:view', isActive: true } },
      ]),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  return {
    prisma,
    audit,
    service: new TenantResolverService(prisma as any, audit as any),
  };
}

describe('TenantResolverService', () => {
  it('revalidates a valid server-issued organization and Membership pair', async () => {
    const { service } = setup();
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
        requestId: 'request-1',
      }),
    ).resolves.toMatchObject({
      organizationId: 'org-a',
      membershipId: 'membership-a',
      role: UserRole.MANAGER,
      permissions: ['company:view'],
      resolutionSource: 'token-session',
      requestId: 'request-1',
    });
  });

  it.each([
    [{ activeOrganizationId: 'org-a' }],
    [{ membershipId: 'membership-a' }],
  ])('rejects partial Tenant claims', async (claims) => {
    const { service } = setup();
    await expect(
      service.resolveAuthenticatedTenant(user.id, { claims }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a mismatching organization and Membership pair', async () => {
    const { service } = setup();
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-b',
          membershipId: 'membership-a',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a Membership belonging to another User', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(
      membership({ userId: 'user-b' }),
    );
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    OrganizationMembershipStatus.INVITED,
    OrganizationMembershipStatus.SUSPENDED,
  ])('rejects stale token access through a %s Membership', async (status) => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(
      membership({ status }),
    );
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([OrganizationStatus.SUSPENDED, OrganizationStatus.ARCHIVED])(
    'rejects stale token access through a %s Organization',
    async (status) => {
      const { prisma, service } = setup();
      prisma.organizationMembership.findUnique.mockResolvedValue(
        membership({ organization: { id: 'org-a', status } }),
      );
      await expect(
        service.resolveAuthenticatedTenant(user.id, {
          claims: {
            activeOrganizationId: 'org-a',
            membershipId: 'membership-a',
          },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('rejects an inactive User despite valid claims', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses the unique active default for a legacy token', async () => {
    const { audit, service } = setup();
    await expect(service.resolveAuthenticatedTenant(user.id)).resolves.toMatchObject({
      membershipId: 'membership-a',
      resolutionSource: 'migration-compatibility',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.compatibility-resolved' }),
    );
  });

  it('uses the sole active non-default Membership for a legacy token', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findMany.mockResolvedValue([
      membership({ isDefault: false }),
    ]);
    await expect(service.resolveAuthenticatedTenant(user.id)).resolves.toMatchObject({
      membershipId: 'membership-a',
    });
  });

  it('selects the valid active default when other active Memberships exist', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findMany.mockResolvedValue([
      membership(),
      membership({
        id: 'membership-b',
        organizationId: 'org-b',
        organization: { id: 'org-b', status: OrganizationStatus.ACTIVE },
        team: null,
        teamId: null,
        isDefault: false,
      }),
    ]);
    await expect(service.resolveAuthenticatedTenant(user.id)).resolves.toMatchObject({
      membershipId: 'membership-a',
      organizationId: 'org-a',
    });
  });

  it('fails closed for multiple active Memberships without a default', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findMany.mockResolvedValue([
      membership({ id: 'membership-a', isDefault: false }),
      membership({
        id: 'membership-b',
        organizationId: 'org-b',
        organization: { id: 'org-b', status: OrganizationStatus.ACTIVE },
        team: null,
        teamId: null,
        isDefault: false,
      }),
    ]);
    await expect(service.resolveAuthenticatedTenant(user.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('fails closed when no active Membership exists', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findMany.mockResolvedValue([]);
    await expect(service.resolveAuthenticatedTenant(user.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('selects an eligible Tenant only through the User Membership', async () => {
    const { service } = setup();
    await expect(service.selectTenant(user.id, 'org-a', 'request-switch')).resolves.toMatchObject({
      organizationId: 'org-a',
      membershipId: 'membership-a',
      resolutionSource: 'explicit-selection',
    });
  });

  it('returns a non-enumerating failure for an unauthorized Tenant selection', async () => {
    const { prisma, audit, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(null);
    await expect(service.selectTenant(user.id, 'org-b')).rejects.toThrow(
      'Tenant selection is not permitted',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.resolution-rejected' }),
    );
  });

  it.each([
    membership({ status: OrganizationMembershipStatus.INVITED }),
    membership({ status: OrganizationMembershipStatus.SUSPENDED }),
    membership({
      organization: { id: 'org-a', status: OrganizationStatus.SUSPENDED },
    }),
  ])('rejects an ineligible Tenant switch candidate', async (candidate) => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(candidate);
    await expect(service.selectTenant(user.id, 'org-a')).rejects.toThrow(
      'Tenant selection is not permitted',
    );
  });

  it('rejects Tenant switching for an inactive User', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(service.selectTenant(user.id, 'org-a')).rejects.toThrow(
      'Tenant selection is not permitted',
    );
  });

  it('fails closed when the claimed Organization relation is missing', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(
      membership({ organization: null }),
    );
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects cross-Organization or inactive Membership Teams', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(
      membership({
        team: { ...membership().team, organizationId: 'org-b' },
      }),
    );
    await expect(
      service.resolveAuthenticatedTenant(user.id, {
        claims: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
