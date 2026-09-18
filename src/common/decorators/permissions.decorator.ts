import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export type PermissionCheckMode = 'all' | 'any';

export interface PermissionPolicyMetadata {
  actions: string[];
  mode: PermissionCheckMode;
}

export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, {
    actions: permissions,
    mode: 'all',
  } satisfies PermissionPolicyMetadata);

export const AnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, {
    actions: permissions,
    mode: 'any',
  } satisfies PermissionPolicyMetadata);