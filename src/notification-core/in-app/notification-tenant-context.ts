import type { TenantContext } from '../../common/tenant/tenant-context.types';

export function notificationTenantContext(organizationId: string, userId = 'notification-core'): TenantContext {
  return { tenantId: organizationId, organizationId, userId, membershipId: 'internal-notification-core', tenantRole: 'SYSTEM', permissions: [], platformAdmin: false, membershipStatus: 'active', resolutionSource: 'authenticated-membership' };
}
