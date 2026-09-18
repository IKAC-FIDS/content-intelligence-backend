/** Trusted sources from which a future server-side context may be resolved. */
export type TenantResolutionSource =
  | 'token-session'
  | 'explicit-selection'
  | 'authenticated-membership'
  | 'migration-compatibility';

export type TenantMembershipStatus =
  | 'invited'
  | 'active'
  | 'suspended';

/**
 * Server-side context for a tenant-owned operation.
 *
 * This contract is not an API DTO and must never be constructed directly from
 * request input. Runtime resolution is deliberately deferred beyond fix 000082.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly tenantRole: string;
  readonly permissions: readonly string[];
  readonly authorizationVersion?: number;
  readonly platformAdmin: boolean;
  readonly membershipStatus: TenantMembershipStatus;
  readonly resolutionSource: TenantResolutionSource;
  readonly requestId?: string | null;
}

/** Explicit platform authority; it does not imply membership in any tenant. */
export interface PlatformScopeContext {
  readonly userId: string;
  readonly platformAdmin: true;
  readonly platformRole: 'PLATFORM_ADMIN';
  readonly requestId?: string | null;
}

export interface TenantScopedOperationContext {
  readonly tenant: TenantContext;
  readonly requestId?: string | null;
}
