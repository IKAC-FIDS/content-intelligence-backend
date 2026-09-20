import { BadRequestException } from '@nestjs/common';
import { Prisma, RoleScope, UserRole } from '@prisma/client';

export async function resolveMembershipRole(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assignment: { roleId?: string; legacyRole?: UserRole },
) {
  if (assignment.roleId) {
    const role = await tx.role.findFirst({
      where: {
        id: assignment.roleId,
        isActive: true,
        OR: [
          { scope: RoleScope.SYSTEM, organizationId: null },
          { scope: RoleScope.TENANT, organizationId },
        ],
      },
      select: { id: true, baseRole: true, scope: true, organizationId: true },
    });
    if (!role) throw new BadRequestException('Role is inactive or is not assignable to this organization');
    return role;
  }

  if (!assignment.legacyRole) throw new BadRequestException('role or roleId is required');
  const roles = await tx.role.findMany({
    where: { baseRole: assignment.legacyRole, scope: RoleScope.SYSTEM, organizationId: null, isActive: true },
    select: { id: true, baseRole: true, scope: true, organizationId: true },
    take: 2,
  });
  if (roles.length !== 1) {
    throw new BadRequestException(`Exactly one active SYSTEM ${assignment.legacyRole} role is required`);
  }
  return roles[0];
}
