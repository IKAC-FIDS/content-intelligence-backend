import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

function executionContext(
  permissions: string[],
  organizationId: string,
  includeTenantContext = true,
) {
  const tenantContext = {
    tenantId: organizationId,
    organizationId,
    userId: 'user-a',
    membershipId: `membership-${organizationId}`,
    tenantRole: UserRole.MANAGER,
    permissions,
    platformAdmin: false,
    membershipStatus: 'active',
    resolutionSource: 'token-session',
  };
  const requestUser: Record<string, unknown> = {
    userId: 'user-a',
    role: UserRole.ADMIN,
    roleId: 'legacy-global-role',
    organizationId,
    membershipId: tenantContext.membershipId,
  };
  if (includeTenantContext) {
    requestUser.tenantContext = tenantContext;
  }
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: requestUser,
      }),
    }),
  } as any;
}

describe('PermissionsGuard Tenant context isolation', () => {
  it('uses permissions from the validated Membership/Tenant context', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['company:view']),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-a',
          role: UserRole.REP,
          roleId: null,
          isActive: true,
        }),
      },
      rolePermission: { findMany: jest.fn() },
    };
    const guard = new PermissionsGuard(reflector as any, prisma as any);
    await expect(
      guard.canActivate(executionContext(['company:view'], 'org-a')),
    ).resolves.toBe(true);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('does not reuse Tenant A permission state after switching to Tenant B', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['company:view']),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-a',
          role: UserRole.REP,
          roleId: null,
          isActive: true,
        }),
      },
      rolePermission: { findMany: jest.fn() },
    };
    const guard = new PermissionsGuard(reflector as any, prisma as any);
    await expect(
      guard.canActivate(executionContext(['company:view'], 'org-a')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(executionContext([], 'org-b')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not authorize from global User role fields without Tenant context', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['company:view']),
    };
    const prisma = {
      user: { findUnique: jest.fn() },
      rolePermission: { findMany: jest.fn() },
    };
    const guard = new PermissionsGuard(reflector as any, prisma as any);

    await expect(
      guard.canActivate(executionContext([], 'org-a', false)),
    ).rejects.toThrow('Tenant context is required');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });
});
