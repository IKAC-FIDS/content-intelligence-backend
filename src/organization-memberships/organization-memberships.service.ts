import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  Prisma,
  User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MembershipUserContext = Pick<User, 'id' | 'isActive'>;

export interface EffectiveMembershipContext {
  membershipId: string | null;
  organizationId: string;
  role: string;
  roleId: string;
  team: string | null;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  source: 'authenticated-membership';
}

@Injectable()
export class OrganizationMembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveEffectiveContext(
    user: MembershipUserContext,
  ): Promise<EffectiveMembershipContext> {
    if (!user.isActive) {
      throw new ForbiddenException('User is inactive');
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: {
        organization: { select: { status: true } },
        role: { select: { id: true, code: true, isActive: true } },
        team: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            organizationId: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const active = memberships.filter(
      (membership) =>
        membership.status === OrganizationMembershipStatus.ACTIVE &&
        membership.organization.status === OrganizationStatus.ACTIVE,
    );
    const defaults = active.filter((membership) => membership.isDefault);
    if (defaults.length > 1) {
      throw new ForbiddenException('Ambiguous active organization memberships');
    }
    let selected = defaults.length === 1 ? defaults[0] : undefined;

    if (!selected && active.length === 1) selected = active[0];
    if (selected) {
      if (selected.team && selected.team.organizationId !== selected.organizationId) {
        throw new ForbiddenException('Membership team belongs to another organization');
      }
      if (selected.team && !selected.team.isActive) {
        throw new ForbiddenException('Membership team is inactive');
      }
      if (selected.role && !selected.role.isActive) {
        throw new ForbiddenException('Membership role is inactive');
      }
      if (!selected.roleId || !selected.role) {
        throw new ForbiddenException('Membership role is required');
      }
      return {
        membershipId: selected.id,
        organizationId: selected.organizationId,
        role: selected.role.code,
        roleId: selected.roleId,
        team: selected.team?.code ?? null,
        teamId: selected.teamId,
        teamCode: selected.team?.code ?? null,
        teamName: selected.team?.name ?? null,
        source: 'authenticated-membership',
      };
    }

    throw new ForbiddenException(
      active.length > 1
        ? 'Tenant selection is required'
        : 'No active organization membership',
    );
  }

  async createInitialMembership(
    tx: Prisma.TransactionClient,
    user: Pick<User, 'id' | 'organizationId' | 'teamId' | 'createdAt' | 'lastLoginAt'>,
    roleId: string,
  ) {
    await this.assertTeamOrganization(tx, user.teamId, user.organizationId);
    return tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        roleId,
        teamId: user.teamId,
        status: OrganizationMembershipStatus.ACTIVE,
        isDefault: true,
        joinedAt: user.createdAt,
        lastAccessAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
    });
  }

  async syncDefaultAssignment(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
    roleId: string,
    teamId: string | null,
  ) {
    await this.assertTeamOrganization(tx, teamId, organizationId);
    return tx.organizationMembership.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { roleId, teamId },
    });
  }

  async syncDefaultTeam(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
    teamId: string | null,
  ) {
    await this.assertTeamOrganization(tx, teamId, organizationId);
    return tx.organizationMembership.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { teamId },
    });
  }

  async suspendForUser(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ) {
    await this.assertOwnerCanBeDeactivated(tx, userId, organizationId);
    return tx.organizationMembership.updateMany({
      where: {
        userId,
        organizationId,
        status: OrganizationMembershipStatus.ACTIVE,
      },
      data: {
        status: OrganizationMembershipStatus.SUSPENDED,
        isDefault: false,
        suspendedAt: new Date(),
      },
    });
  }

  private async assertOwnerCanBeDeactivated(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ) {
    await tx.$queryRaw<Array<{ lockResult: string | null }>>(Prisma.sql`
      SELECT CAST(pg_advisory_xact_lock(hashtext(${`tenant-owner:${organizationId}`})) AS TEXT) AS "lockResult"
    `);
    const target = await tx.organizationMembership.findFirst({
      where: { userId, organizationId, status: OrganizationMembershipStatus.ACTIVE, isTenantOwner: true, user: { isActive: true } },
      select: { id: true },
    });
    if (!target) return;
    const activeOwners = await tx.organizationMembership.count({
      where: { organizationId, status: OrganizationMembershipStatus.ACTIVE, isTenantOwner: true, user: { isActive: true } },
    });
    if (activeOwners <= 1) throw new ConflictException('The last active tenant owner cannot be deactivated');
  }

  async activateForUser(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ) {
    await tx.organizationMembership.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
    return tx.organizationMembership.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: {
        status: OrganizationMembershipStatus.ACTIVE,
        isDefault: true,
        joinedAt: new Date(),
        suspendedAt: null,
      },
    });
  }

  async touchLastAccess(membershipId: string | null) {
    if (!membershipId) return;
    await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: { lastAccessAt: new Date() },
    });
  }

  private async assertTeamOrganization(
    tx: Prisma.TransactionClient,
    teamId: string | null,
    organizationId: string,
  ) {
    if (!teamId) return;
    const team = await tx.team.findFirst({
      where: { id: teamId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!team) {
      throw new ForbiddenException('Membership team belongs to another organization or is inactive');
    }
  }
}
