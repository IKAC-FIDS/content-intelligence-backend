import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMembershipStatus, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { FindTeamsDto } from './dto/find-teams.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

const teamInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  _count: {
    select: {
      membershipLinks: true,
    },
  },
} satisfies Prisma.TeamInclude;

const membershipMemberSelect = {
  id: true,
  status: true,
  roleId: true,
  role: { select: { id: true, code: true, name: true } },
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      avatarObjectKey: true,
    },
  },
} satisfies Prisma.OrganizationMembershipSelect;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(query: FindTeamsDto, user: CurrentUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const isActive = query.isActive ?? (query.includeInactive ? undefined : true);

    const where: Prisma.TeamWhereInput = {
      organizationId: getCurrentOrganizationId(user),
      ...(isActive !== undefined && { isActive }),
      ...(query.managerId && { managerId: query.managerId }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        include: teamInclude,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.team.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: data.map((team) => this.toTeamResponse(team)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async findOne(id: string, user: CurrentUserPayload) {
    const team = await this.getTeam(id, user);

    return this.toTeamResponse(team);
  }

  async create(dto: CreateTeamDto, user: CurrentUserPayload) {
    const code = this.normalizeCode(dto.code);
    const organizationId = getCurrentOrganizationId(user);

    const duplicate = await this.prisma.team.findUnique({
      where: { organizationId_code: { organizationId, code } },
    });

    if (duplicate) {
      throw new ConflictException('Team code already exists');
    }

    const manager = dto.managerId
      ? await this.getValidManager(dto.managerId, user)
      : null;

    const team = await this.prisma.team.create({
      data: {
        code,
        name: this.requiredText(dto.name, 'Team name is required'),
        description: dto.description?.trim() || undefined,
        managerId: manager?.id,
        organizationId,
      },
      include: teamInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'team',
      entityId: team.id,
      action: 'team.created',
      after: team,
    });

    return this.toTeamResponse(team);
  }

  async update(id: string, dto: UpdateTeamDto, user: CurrentUserPayload) {
    const current = await this.getTeam(id, user);
    const data: Prisma.TeamUpdateInput = {};

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      const organizationId = getCurrentOrganizationId(user);
      const duplicate = await this.prisma.team.findUnique({
        where: { organizationId_code: { organizationId, code } },
      });

      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Team code already exists');
      }

      data.code = code;
    }

    if (dto.name !== undefined) {
      data.name = this.requiredText(dto.name, 'Team name is required');
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.managerId !== undefined) {
      data.manager = dto.managerId
        ? { connect: { id: (await this.getValidManager(dto.managerId, user)).id } }
        : { disconnect: true };
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const updated = await this.prisma.team.update({
      where: { id },
      data,
      include: teamInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'team',
      entityId: id,
      action: 'team.updated',
      before: current,
      after: updated,
    });

    return this.toTeamResponse(updated);
  }

  async activate(id: string, user: CurrentUserPayload) {
    return this.update(id, { isActive: true }, user);
  }

  async deactivate(id: string, user: CurrentUserPayload) {
    return this.update(id, { isActive: false }, user);
  }

  async members(id: string, user: CurrentUserPayload) {
    await this.getTeam(id, user);

    const links = await this.prisma.organizationMembershipTeam.findMany({
      where: {
        teamId: id,
        membership: {
          organizationId: getCurrentOrganizationId(user),
        },
      },
      select: { membership: { select: membershipMemberSelect } },
      orderBy: [
        { membership: { user: { fullName: 'asc' } } },
        { membership: { user: { email: 'asc' } } },
      ],
    });
    return links.map(({ membership }) => this.toMemberResponse(membership));
  }

  async addMember(id: string, dto: AddTeamMemberDto, user: CurrentUserPayload) {
    const team = await this.getTeam(id, user);

    if (!team.isActive) {
      throw new BadRequestException('Cannot assign users to an inactive team');
    }

    const membership = await this.getMembership(dto.userId, user);

    await this.prisma.organizationMembershipTeam.upsert({
      where: {
        membershipId_teamId: {
          membershipId: membership.id,
          teamId: team.id,
        },
      },
      create: {
        membershipId: membership.id,
        teamId: team.id,
      },
      update: {},
    });
    const updated = await this.prisma.organizationMembership.findUniqueOrThrow({
      where: { id: membership.id },
      select: membershipMemberSelect,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'team',
      entityId: team.id,
      action: 'team.member_added',
      before: membership,
      after: { membershipId: membership.id, teamId: team.id },
    });

    return this.toMemberResponse(updated);
  }

  async removeMember(id: string, userId: string, user: CurrentUserPayload) {
    await this.getTeam(id, user);

    const membership = await this.getMembership(userId, user);
    const link = await this.prisma.organizationMembershipTeam.findUnique({
      where: {
        membershipId_teamId: { membershipId: membership.id, teamId: id },
      },
    });
    if (!link) {
      throw new BadRequestException('User is not a member of this team');
    }

    await this.prisma.organizationMembershipTeam.delete({
      where: {
        membershipId_teamId: { membershipId: membership.id, teamId: id },
      },
    });
    const updated = await this.prisma.organizationMembership.findUniqueOrThrow({
      where: { id: membership.id },
      select: membershipMemberSelect,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'team',
      entityId: id,
      action: 'team.member_removed',
      before: { membershipId: membership.id, teamId: id },
      after: membership,
    });

    return this.toMemberResponse(updated);
  }

  private async getTeam(id: string, user: CurrentUserPayload) {
    const team = await this.prisma.team.findFirst({
      where: {
        id,
        organizationId: getCurrentOrganizationId(user),
      },
      include: teamInclude,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  private async getMembership(userId: string, user: CurrentUserPayload) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: getCurrentOrganizationId(user),
        },
      },
      select: membershipMemberSelect,
    });

    if (!membership) {
      throw new NotFoundException('User not found');
    }

    return membership;
  }

  private async getValidManager(managerId: string, user: CurrentUserPayload) {
    const manager = await this.prisma.user.findFirst({
      where: {
        id: managerId,
        isActive: true,
        organizationMemberships: {
          some: {
            organizationId: getCurrentOrganizationId(user),
            status: OrganizationMembershipStatus.ACTIVE,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!manager) {
      throw new BadRequestException('Team manager must be an active organization member');
    }

    return manager;
  }

  private toTeamResponse<T extends {
    _count?: { membershipLinks: number };
  }>(team: T) {
    const { _count, ...rest } = team;

    return {
      ...rest,
      memberCount: _count?.membershipLinks ?? 0,
    };
  }

  private toMemberResponse<T extends {
    id: string;
    status: OrganizationMembershipStatus;
    roleId: string | null;
    role: { id: string; code: string; name: string } | null;
    user: {
      id: string;
      fullName: string;
      email: string;
      isActive: boolean;
      avatarObjectKey: string | null;
    };
  }>(membership: T) {
    return {
      ...membership.user,
      membershipId: membership.id,
      membershipStatus: membership.status,
      roleId: membership.roleId,
      role: membership.role?.code ?? null,
      assignedRole: membership.role,
    };
  }

  private normalizeCode(value: string) {
    const code = value
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();

    if (!code) {
      throw new BadRequestException('Team code is required');
    }

    return code;
  }

  private requiredText(value: string, message: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

}
