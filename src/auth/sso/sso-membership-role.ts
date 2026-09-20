import { BadRequestException } from '@nestjs/common';
import { Prisma, RoleScope } from '@prisma/client';
import { resolveMembershipRole } from '../../organization-memberships/membership-role-assignment';

type RoleClient = Pick<Prisma.TransactionClient, 'role' | 'ssoGroupRoleMapping'>;

export async function resolveSsoMappedRole(
  tx: RoleClient,
  providerId: string,
  organizationId: string,
  groups: string[],
) {
  const mappings = groups.length
    ? await tx.ssoGroupRoleMapping.findMany({
        where: { providerId, normalizedGroup: { in: groups } },
        select: { roleId: true },
      })
    : [];
  const roleIds = [...new Set(mappings.map((mapping) => mapping.roleId))];
  if (roleIds.length > 1) throw new BadRequestException('Conflicting SSO group mappings');
  if (!roleIds.length) return null;
  return resolveMembershipRole(tx as Prisma.TransactionClient, organizationId, { roleId: roleIds[0] });
}

export function hasUsableMembershipRole(
  membership: { roleId: string | null; role?: { isActive: boolean; scope: RoleScope; organizationId: string | null } | null },
  organizationId: string,
) {
  const role = membership.role;
  return Boolean(
    membership.roleId && role?.isActive && (
      (role.scope === RoleScope.SYSTEM && role.organizationId === null) ||
      (role.scope === RoleScope.TENANT && role.organizationId === organizationId)
    ),
  );
}
