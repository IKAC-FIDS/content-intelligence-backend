import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';

const account = {
  id: 'user-a',
  email: 'user@example.test',
  fullName: 'User A',
  role: UserRole.REP,
};

const context = (organizationId: string, membershipId: string) => ({
  tenantId: organizationId,
  organizationId,
  userId: account.id,
  membershipId,
  tenantRole: UserRole.MANAGER,
  permissions: ['company:view'],
  platformAdmin: false as const,
  membershipStatus: 'active' as const,
  resolutionSource: 'explicit-selection' as const,
  requestId: 'request-switch',
  role: UserRole.MANAGER,
  roleId: 'role-manager',
  team: null,
  teamId: null,
  teamCode: null,
  teamName: null,
});

function setup() {
  const prisma = {
    role: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'role-manager',
        code: 'MANAGER',
        name: 'Manager',
      }),
    },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('new-access-token') };
  const refresh = {
    getActiveSession: jest.fn().mockResolvedValue({
      user: account,
      refreshSessionId: 'session-old',
      tenantContext: {
        activeOrganizationId: 'org-a',
        membershipId: 'membership-a',
      },
    }),
    rotateRefreshToken: jest.fn().mockResolvedValue({
      user: account,
      refreshToken: 'new-refresh-token',
      refreshTokenMaxAgeMs: 60_000,
      refreshTokenExpiresAt: new Date('2026-08-09T12:00:00Z'),
      refreshSessionId: 'session-new',
      tenantContext: {
        activeOrganizationId: 'org-b',
        membershipId: 'membership-b',
      },
    }),
  };
  const config = { get: jest.fn((_key: string, fallback: string) => fallback) };
  const memberships = { touchLastAccess: jest.fn().mockResolvedValue(undefined) };
  const resolver = {
    resolveAuthenticatedTenant: jest.fn().mockResolvedValue(
      context('org-a', 'membership-a'),
    ),
    selectTenant: jest.fn().mockResolvedValue(context('org-b', 'membership-b')),
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  return {
    jwt,
    refresh,
    resolver,
    audit,
    service: new AuthService(
      prisma as any,
      jwt as any,
      refresh as any,
      config as any,
      memberships as any,
      resolver as any,
      audit as any,
    ),
  };
}

describe('AuthService Tenant switch', () => {
  const requestUser = {
    userId: account.id,
    email: account.email,
    role: UserRole.MANAGER,
    organizationId: 'org-a',
    activeOrganizationId: 'org-a',
    membershipId: 'membership-a',
    tenantContext: context('org-a', 'membership-a'),
  };

  it('validates candidate Membership, rotates the refresh session, and issues new claims', async () => {
    const { service, resolver, refresh, jwt, audit } = setup();
    const result = await service.switchTenant(
      requestUser,
      'org-b',
      'old-refresh-token',
      { requestId: 'request-switch' } as any,
    );
    expect(resolver.selectTenant).toHaveBeenCalledWith(
      account.id,
      'org-b',
      'request-switch',
    );
    expect(refresh.rotateRefreshToken).toHaveBeenCalledWith(
      'old-refresh-token',
      expect.anything(),
      { activeOrganizationId: 'org-b', membershipId: 'membership-b' },
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-b',
        activeOrganizationId: 'org-b',
        membershipId: 'membership-b',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.switched',
        requestId: 'request-switch',
      }),
    );
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it.each([
    ['legacy', null],
    [
      'new',
      { activeOrganizationId: 'org-a', membershipId: 'membership-a' },
    ],
  ])(
    'revalidates and converges a %s refresh session to explicit Tenant context',
    async (_kind, tenantContext) => {
      const { service, refresh, resolver } = setup();
      refresh.getActiveSession.mockResolvedValue({
        user: account,
        refreshSessionId: 'session-old',
        tenantContext,
      });
      refresh.rotateRefreshToken.mockResolvedValue({
        user: account,
        refreshToken: 'rotated-refresh-token',
        refreshTokenMaxAgeMs: 60_000,
        refreshTokenExpiresAt: new Date('2026-08-09T12:00:00Z'),
        refreshSessionId: 'session-new',
        tenantContext: {
          activeOrganizationId: 'org-a',
          membershipId: 'membership-a',
        },
      });
      await service.refresh('current-refresh-token');
      expect(resolver.resolveAuthenticatedTenant).toHaveBeenCalledWith(
        account.id,
        expect.objectContaining({ claims: tenantContext ?? undefined }),
      );
      expect(refresh.rotateRefreshToken).toHaveBeenCalledWith(
        'current-refresh-token',
        undefined,
        { activeOrganizationId: 'org-a', membershipId: 'membership-a' },
      );
    },
  );

  it('rejects a switch when the refresh session belongs to another User', async () => {
    const { service, refresh, resolver, audit } = setup();
    refresh.getActiveSession.mockResolvedValue({
      user: { ...account, id: 'user-b' },
      tenantContext: null,
    });
    await expect(
      service.switchTenant(requestUser, 'org-b', 'old-refresh-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolver.selectTenant).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.switch-rejected' }),
    );
  });

  it('rotates safely even when explicitly selecting the current Tenant', async () => {
    const { service, resolver, refresh } = setup();
    resolver.selectTenant.mockResolvedValue(context('org-a', 'membership-a'));
    refresh.rotateRefreshToken.mockResolvedValue({
      user: account,
      refreshToken: 'rotated-current-refresh',
      refreshTokenMaxAgeMs: 60_000,
      refreshTokenExpiresAt: new Date('2026-08-09T12:00:00Z'),
      refreshSessionId: 'session-current-new',
      tenantContext: {
        activeOrganizationId: 'org-a',
        membershipId: 'membership-a',
      },
    });
    await service.switchTenant(
      requestUser,
      'org-a',
      'old-refresh-token',
    );
    expect(refresh.rotateRefreshToken).toHaveBeenCalledWith(
      'old-refresh-token',
      undefined,
      { activeOrganizationId: 'org-a', membershipId: 'membership-a' },
    );
  });

  it('never exposes internal refresh Tenant context in the public auth response', () => {
    const { service } = setup();
    const publicResponse = service.toPublicAuthResponse({
      accessToken: 'access',
      accessTokenExpiresIn: '15m',
      user: {} as any,
      refreshToken: 'refresh',
      refreshTokenMaxAgeMs: 60_000,
      refreshTokenExpiresAt: new Date(),
      refreshSessionId: 'session',
      tenantContext: {
        activeOrganizationId: 'org-a',
        membershipId: 'membership-a',
      },
    } as any);
    expect(publicResponse).toEqual({
      accessToken: 'access',
      accessTokenExpiresIn: '15m',
      user: {},
    });
  });
});
