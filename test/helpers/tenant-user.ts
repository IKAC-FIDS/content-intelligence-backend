import type { CurrentUserPayload } from '../../src/common/decorators/current-user.decorator';

export function tenantUser<T extends CurrentUserPayload>(
  user: T,
  organizationId = user.organizationId ?? 'organization-test',
): T {
  return {
    ...user,
    organizationId,
    activeOrganizationId: organizationId,
    membershipId: `membership:${organizationId}:${user.userId}`,
    tenantResolutionSource: 'token-session',
    tenantContext: {
      tenantId: organizationId,
      organizationId,
      userId: user.userId,
      membershipId: `membership:${organizationId}:${user.userId}`,
      tenantRole: user.role,
      permissions: [],
      platformAdmin: false,
      membershipStatus: 'active',
      resolutionSource: 'token-session',
    },
  };
}
