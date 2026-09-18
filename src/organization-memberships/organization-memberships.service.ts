import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LegacyUserContext = Pick<
  User,
  | 'id'
  | 'organizationId'
  | 'role'
  | 'roleId'
  | 'team'
  | 'teamId'
  | 'isActive'
>;

export interface EffectiveMembershipContext {
  membershipId: string | null;
  organizationId: string;
  role: UserRole;
  roleId: string | null;
  team: string | null;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  source: 'authenticated-membership' | 'migration-compatibility';
}

@Injectable()
export class OrganizationMembershipsService {
  private readonly logger = new Logger(OrganizationMembershipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveEffectiveContext(
    user: LegacyUserContext,
  ): Promise<EffectiveMembershipContext> {
    if (!user.isActive) {
      throw new ForbiddenException('User is inactive');
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: {
        organization: { select: { status: true } },
        role: { select: { id: true, baseRole: true, isActive: true } },
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
    if (!selected && active.length > 1) {
      const legacyMatches = active.filter(
        (membership) => membership.organizationId === user.organizationId,
      );
      if (legacyMatches.length === 1) {
        selected = legacyMatches[0];
        this.logger.warn(
          `Membership compatibility selection used userId=${user.id} membershipId=${selected.id}`,
        );
      }
    }

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
      return {
        membershipId: selected.id,
        organizationId: selected.organizationId,
        role: selected.role?.baseRole ?? user.role,
        roleId: selected.roleId,
        team: selected.team?.code ?? user.team,
        teamId: selected.teamId,
        teamCode: selected.team?.code ?? user.team,
        teamName: selected.team?.name ?? null,
        source: 'authenticated-membership',
      };
    }

    if (memberships.length > 0) {
      throw new ForbiddenException('No active organization membership');
    }

    const legacyOrganization = await this.prisma.organization.findFirst({
      where: { id: user.organizationId, status: OrganizationStatus.ACTIVE },
      select: { id: true },
    });
    if (!legacyOrganization) {
      throw new ForbiddenException('No active organization membership');
    }
    const legacyTeam = user.teamId
      ? await this.prisma.team.findFirst({
          where: {
            id: user.teamId,
            organizationId: user.organizationId,
            isActive: true,
          },
          select: { id: true, code: true, name: true },
        })
      : null;
    if (user.teamId && !legacyTeam) {
      throw new ForbiddenException('Legacy team is invalid or belongs to another organization');
    }
    const legacyRole = user.roleId
      ? await this.prisma.role.findFirst({
          where: { id: user.roleId, isActive: true },
          select: { id: true },
        })
      : null;
    if (user.roleId && !legacyRole) {
      throw new ForbiddenException('Legacy role is invalid or inactive');
    }
    this.logger.warn(`Legacy membership fallback used userId=${user.id}`);
    return {
      membershipId: null,
      organizationId: user.organizationId,
      role: user.role,
      roleId: user.roleId,
      team: legacyTeam?.code ?? user.team,
      teamId: legacyTeam?.id ?? null,
      teamCode: legacyTeam?.code ?? user.team,
      teamName: legacyTeam?.name ?? null,
      source: 'migration-compatibility',
    };
  }

  async createInitialMembership(
    tx: Prisma.TransactionClient,
    user: Pick<User, 'id' | 'organizationId' | 'roleId' | 'teamId' | 'createdAt' | 'lastLoginAt'>,
  ) {
    await this.assertTeamOrganization(tx, user.teamId, user.organizationId);
    return tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        roleId: user.roleId,
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
    roleId: string | null,
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
