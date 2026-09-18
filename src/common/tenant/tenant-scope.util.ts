import { CurrentUserPayload } from '../decorators/current-user.decorator';
import type { TenantContext } from './tenant-context.types';
import { assertActiveTenantContext } from './tenant-context.util';

export type TenantAuthority = CurrentUserPayload | TenantContext;

function contextFrom(authority: TenantAuthority): TenantContext {
  const candidate = 'tenantRole' in authority ? authority : authority.tenantContext;
  assertActiveTenantContext(candidate);
  return candidate;
}

/** Central fail-closed boundary for Tenant-owned data access. */
export const tenantScope = {
  require(authority: TenantAuthority): TenantContext {
    return contextFrom(authority);
  },
  organizationId(authority: TenantAuthority): string {
    return contextFrom(authority).organizationId;
  },
  direct<T extends object>(authority: TenantAuthority, where?: T) {
    return { AND: [where ?? {}, { organizationId: contextFrom(authority).organizationId }] };
  },
  throughCompany<T extends object>(authority: TenantAuthority, where?: T) {
    return { AND: [where ?? {}, { company: { organizationId: contextFrom(authority).organizationId } }] };
  },
  activeMembership(authority: TenantAuthority) {
    return {
      organizationMemberships: {
        some: {
          organizationId: contextFrom(authority).organizationId,
          status: 'ACTIVE' as const,
        },
      },
    };
  },
} as const;

export function getCurrentOrganizationId(user: CurrentUserPayload): string {
  return tenantScope.organizationId(user);
}
