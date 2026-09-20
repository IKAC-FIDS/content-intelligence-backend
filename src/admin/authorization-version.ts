import { OrganizationMembershipStatus, Prisma, RoleScope } from '@prisma/client';

export async function incrementAuthorizationVersionsForRoleIds(
  tx: Prisma.TransactionClient,
  roleIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(roleIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return [];

  const roles = await tx.role.findMany({
    where: { id: { in: ids } },
    select: { id: true, scope: true, organizationId: true },
  });
  const organizationIds = new Set(
    roles
      .filter((role) => role.scope === RoleScope.TENANT && role.organizationId)
      .map((role) => role.organizationId as string),
  );
  const systemRoleIds = roles
    .filter((role) => role.scope === RoleScope.SYSTEM)
    .map((role) => role.id);

  if (systemRoleIds.length) {
    const memberships = await tx.organizationMembership.findMany({
      where: { roleId: { in: systemRoleIds }, status: OrganizationMembershipStatus.ACTIVE },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    memberships.forEach((membership) => organizationIds.add(membership.organizationId));
  }

  const affected = [...organizationIds];
  if (affected.length) {
    await tx.organization.updateMany({
      where: { id: { in: affected } },
      data: { authorizationVersion: { increment: 1 } },
    });
  }
  return affected;
}
