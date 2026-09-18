import { PermissionPolicyMetadata } from '../src/common/decorators/permissions.decorator';
import { TenantAwareService } from '../src/common/tenant/tenant-aware-service.interface';
import {
  PlatformScopeContext,
  TenantContext,
  TenantResolutionSource,
} from '../src/common/tenant/tenant-context.types';
import { assertActiveTenantContext } from '../src/common/tenant/tenant-context.util';

const validContext = (): TenantContext => ({
  tenantId: 'tenant-1',
  organizationId: 'organization-1',
  userId: 'user-1',
  membershipId: 'membership-1',
  tenantRole: 'TENANT_ADMIN',
  permissions: ['company:view'],
  platformAdmin: false,
  membershipStatus: 'active',
  resolutionSource: 'authenticated-membership',
  requestId: 'request-1',
});

describe('TenantContext architecture contract', () => {
  it('accepts a complete active context and existing string permissions', () => {
    const context: unknown = Object.freeze(validContext());
    const permissionPolicy: PermissionPolicyMetadata = {
      actions: [...validContext().permissions],
      mode: 'all',
    };

    expect(() => assertActiveTenantContext(context)).not.toThrow();
    expect(permissionPolicy.actions).toEqual(['company:view']);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it.each(['tenantId', 'organizationId', 'userId', 'membershipId'] as const)(
    'rejects a missing %s without applying an implicit tenant default',
    (key) => {
      const context = { ...validContext(), [key]: '' };

      expect(() => assertActiveTenantContext(context)).toThrow(key);
    },
  );

  it.each(['invited', 'suspended'] as const)(
    'rejects %s membership',
    (membershipStatus) => {
      expect(() =>
        assertActiveTenantContext({ ...validContext(), membershipStatus }),
      ).toThrow('active membership');
    },
  );

  it('rejects unknown resolution sources', () => {
    expect(() =>
      assertActiveTenantContext({
        ...validContext(),
        resolutionSource: 'request-header',
      }),
    ).toThrow('resolution source');
  });

  it('constrains accepted resolution-source values', () => {
    const sources: TenantResolutionSource[] = [
      'authenticated-membership',
      'migration-compatibility',
    ];

    expect(sources).toHaveLength(2);
  });

  it('keeps tenant administration separate from platform authority', () => {
    const tenantAdmin = validContext();
    const platformAdmin: PlatformScopeContext = {
      userId: 'platform-user-1',
      platformAdmin: true,
      platformRole: 'PLATFORM_ADMIN',
      requestId: null,
    };

    expect(tenantAdmin.platformAdmin).toBe(false);
    expect(platformAdmin).not.toHaveProperty('tenantId');
    expect(platformAdmin).not.toHaveProperty('membershipId');
  });

  it('requires TenantContext at the tenant-aware service boundary', async () => {
    const service: TenantAwareService<{ id: string }, string> = {
      async execute(context, input) {
        assertActiveTenantContext(context);
        return `${context.tenantId}:${input.id}`;
      },
    };

    await expect(service.execute(validContext(), { id: 'record-1' })).resolves.toBe(
      'tenant-1:record-1',
    );
  });
});
