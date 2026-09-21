import { OrganizationMembershipStatus, Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { getCurrentOrganizationId } from './tenant-scope.util';
import { PrismaService } from '../../prisma/prisma.service';

export function currentUserTeamWhere(
  user: CurrentUserPayload,
): Prisma.TeamWhereInput {
  return {
    organizationId: getCurrentOrganizationId(user),
    membershipLinks: {
      some: {
        membership: {
          userId: user.userId,
          organizationId: getCurrentOrganizationId(user),
          status: OrganizationMembershipStatus.ACTIVE,
        },
      },
    },
  };
}

export function userTeamScopeWhere(user: CurrentUserPayload): Prisma.UserWhereInput {
  const organizationId = getCurrentOrganizationId(user);
  return {
    organizationMemberships: {
      some: {
        organizationId,
        status: OrganizationMembershipStatus.ACTIVE,
        teams: {
          some: {
            team: {
              membershipLinks: {
                some: {
                  membership: {
                    userId: user.userId,
                    organizationId,
                    status: OrganizationMembershipStatus.ACTIVE,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function userTeamFilterWhere(
  values: string[],
  user: CurrentUserPayload,
): Prisma.UserWhereInput {
  const normalized = values.map((value) => value.trim()).filter(Boolean);

  if (!normalized.length) return {};

  return {
    organizationMemberships: {
      some: {
        organizationId: getCurrentOrganizationId(user),
        teams: {
          some: {
            team: {
              OR: [
                { id: { in: normalized } },
                { code: { in: normalized, mode: 'insensitive' } },
                { name: { in: normalized, mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    },
  };
}

export async function usersShareTeam(
  prisma: PrismaService | Prisma.TransactionClient,
  candidateUserId: string,
  user: CurrentUserPayload,
): Promise<boolean> {
  const organizationId = getCurrentOrganizationId(user);
  const shared = await prisma.organizationMembershipTeam.findFirst({
    where: {
      membership: {
        userId: candidateUserId,
        organizationId,
        status: OrganizationMembershipStatus.ACTIVE,
      },
      team: {
        membershipLinks: {
          some: {
            membership: {
              userId: user.userId,
              organizationId,
              status: OrganizationMembershipStatus.ACTIVE,
            },
          },
        },
      },
    },
    select: { teamId: true },
  });
  return Boolean(shared);
}

export async function usersShareTenantTeam(
  prisma: PrismaService | Prisma.TransactionClient,
  firstUserId: string,
  secondUserId: string,
  organizationId: string,
): Promise<boolean> {
  const shared = await prisma.organizationMembershipTeam.findFirst({
    where: {
      membership: {
        userId: firstUserId,
        organizationId,
        status: OrganizationMembershipStatus.ACTIVE,
      },
      team: {
        membershipLinks: {
          some: {
            membership: {
              userId: secondUserId,
              organizationId,
              status: OrganizationMembershipStatus.ACTIVE,
            },
          },
        },
      },
    },
    select: { teamId: true },
  });
  return Boolean(shared);
}
