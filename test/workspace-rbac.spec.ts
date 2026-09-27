import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionPolicyMetadata } from '../src/common/decorators/permissions.decorator';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { WorkspacesController } from '../src/workspaces/workspaces.controller';
import { FOUNDATION_PERMISSIONS } from '../prisma/seed';

const cases: Array<[keyof WorkspacesController, string]> = [
  ['findAll', 'workspace:view'],
  ['findOne', 'workspace:view'],
  ['create', 'workspace:create'],
  ['update', 'workspace:update'],
  ['archive', 'workspace:archive'],
];

function context(handler: keyof WorkspacesController, permissions: string[], platformAdmin = false) {
  const user = {
    userId: 'user-a',
    tenantContext: {
      tenantId: 'org-a',
      organizationId: 'org-a',
      userId: 'user-a',
      membershipId: 'membership-a',
      tenantRole: 'CUSTOM_ROLE',
      permissions,
      platformAdmin,
      membershipStatus: 'active',
      resolutionSource: 'token-session',
    },
  };
  return {
    getHandler: () => WorkspacesController.prototype[handler],
    getClass: () => WorkspacesController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('Workspace RBAC', () => {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-a', isActive: true }) },
  };
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector, prisma);

  it('registers the exact Workspace permissions in the authoritative seed', () => {
    const actions = FOUNDATION_PERMISSIONS.map(([action]) => action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'workspace:view',
        'workspace:create',
        'workspace:update',
        'workspace:archive',
      ]),
    );
  });

  it.each(cases)('%s requires exactly %s', (handler, permission) => {
    const policy = Reflect.getMetadata(
      PERMISSIONS_KEY,
      WorkspacesController.prototype[handler],
    ) as PermissionPolicyMetadata;
    expect(policy).toEqual({ actions: [permission], mode: 'all' });
  });

  it.each(cases)('allows %s when a custom Role grants %s', async (handler, permission) => {
    await expect(guard.canActivate(context(handler, [permission]))).resolves.toBe(true);
  });

  it.each(cases)('rejects %s when %s is missing', async (handler) => {
    await expect(guard.canActivate(context(handler, []))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses Tenant Owner permissions without role-name special casing', async () => {
    await expect(guard.canActivate(context('create', ['workspace:create']))).resolves.toBe(true);
  });

  it('does not let PlatformAuthority bypass ordinary Tenant Workspace permissions', async () => {
    await expect(guard.canActivate(context('archive', [], true))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
