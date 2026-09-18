import {
  TenantContext,
  TenantMembershipStatus,
  TenantResolutionSource,
} from './tenant-context.types';

const MEMBERSHIP_STATUSES = new Set<TenantMembershipStatus>([
  'invited',
  'active',
  'suspended',
]);

const RESOLUTION_SOURCES = new Set<TenantResolutionSource>([
  'token-session',
  'explicit-selection',
  'authenticated-membership',
  'migration-compatibility',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireIdentifier(
  value: Record<string, unknown>,
  key: 'tenantId' | 'organizationId' | 'userId' | 'membershipId',
): void {
  if (typeof value[key] !== 'string' || !value[key].trim()) {
    throw new Error(`TenantContext requires ${key}`);
  }
}

/**
 * Fail-closed assertion for future trusted application boundaries.
 * It validates a resolved context; it does not resolve or default a tenant.
 */
export function assertActiveTenantContext(
  value: unknown,
): asserts value is TenantContext {
  if (!isRecord(value)) {
    throw new Error('TenantContext is required');
  }

  requireIdentifier(value, 'tenantId');
  requireIdentifier(value, 'organizationId');
  requireIdentifier(value, 'userId');
  requireIdentifier(value, 'membershipId');

  if (
    typeof value.membershipStatus !== 'string' ||
    !MEMBERSHIP_STATUSES.has(value.membershipStatus as TenantMembershipStatus)
  ) {
    throw new Error('TenantContext has an invalid membership status');
  }

  if (value.membershipStatus !== 'active') {
    throw new Error('TenantContext requires an active membership');
  }

  if (
    typeof value.resolutionSource !== 'string' ||
    !RESOLUTION_SOURCES.has(value.resolutionSource as TenantResolutionSource)
  ) {
    throw new Error('TenantContext has an invalid resolution source');
  }

  if (typeof value.tenantRole !== 'string' || !value.tenantRole.trim()) {
    throw new Error('TenantContext requires tenantRole');
  }

  if (
    !Array.isArray(value.permissions) ||
    !value.permissions.every((permission) => typeof permission === 'string')
  ) {
    throw new Error('TenantContext requires string permissions');
  }

  if (typeof value.platformAdmin !== 'boolean') {
    throw new Error('TenantContext requires explicit platformAdmin authority');
  }
}
