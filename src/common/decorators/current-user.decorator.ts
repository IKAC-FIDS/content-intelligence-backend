import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { TenantContext } from '../tenant/tenant-context.types';

export interface CurrentUserPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'REP' | 'BOARDS';
  roleId?: string | null;
  team?: string | null;
  teamId?: string | null;
  teamCode?: string | null;
  teamName?: string | null;
  organizationId?: string | null;
  activeOrganizationId?: string | null;
  membershipId?: string | null;
  tenantResolutionSource?:
    | 'token-session'
    | 'explicit-selection'
    | 'authenticated-membership'
    | 'migration-compatibility';
  tenantContext?: TenantContext;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();

    return request.user;
  },
);
