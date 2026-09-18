import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { FindTeamsDto } from './dto/find-teams.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { OrganizationMembershipsService } from '../organization-memberships/organization-memberships.service';

const teamInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      team: true,
      teamId: true,
    },
  },
  _count: {
    select: {
      members: true,
    },
  },
} satisfies Prisma.TeamInclude;

const memberSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  team: true,
  teamId: true,
  isActive: true,
  teamRef: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly memberships: OrganizationMembershipsService,
  ) {}

  async findAll(query: FindTeamsDto, user: CurrentUserPayload) {
    this.assertCanView(user);

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
    this.assertCanView(user);

    const team = await this.getTeam(id, user);

    return this.toTeamResponse(team);
  }

  async create(dto: CreateTeamDto, user: CurrentUserPayload) {
    this.assertAdmin(user);

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
    this.assertAdmin(user);

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

    if (dto.code !== undefined && updated.code !== current.code) {
      await this.syncLegacyTeamForMembers(updated.id, updated.code);
    }

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
    this.assertCanView(user);
    await this.getTeam(id, user);

    return this.prisma.user.findMany({
      where: {
        teamId: id,
        organizationId: getCurrentOrganizationId(user),
      },
      select: memberSelect,
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
    });
  }

  async addMember(id: string, dto: AddTeamMemberDto, user: CurrentUserPayload) {
    this.assertAdmin(user);

    const team = await this.getTeam(id, user);

    if (!team.isActive) {
      throw new BadRequestException('Cannot assign users to an inactive team');
    }

    const member = await this.getUserInOrganization(dto.userId, user);

    const organizationId = getCurrentOrganizationId(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: member.id },
        data: { teamId: team.id, team: team.code },
        select: memberSelect,
      });
      await this.memberships.syncDefaultTeam(
        tx,
        member.id,
        organizationId,
        team.id,
      );
      return result;
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'team',
      entityId: team.id,
      action: 'team.member_added',
      before: member,
      after: updated,
    });

    return updated;
  }

  async removeMember(id: string, userId: string, user: CurrentUserPayload) {
    this.assertAdmin(user);
    await this.getTeam(id, user);

    const member = await this.getUserInOrganization(userId, user);

    if (member.teamId !== id) {
      throw new BadRequestException('User is not a member of this team');
    }

    const organizationId = getCurrentOrganizationId(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: member.id },
        data: { teamId: null, team: null },
        select: memberSelect,
      });
      await this.memberships.syncDefaultTeam(
        tx,
        member.id,
        organizationId,
        null,
      );
      return result;
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'team',
      entityId: id,
      action: 'team.member_removed',
      before: member,
      after: updated,
    });

    return updated;
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

  private async getUserInOrganization(userId: string, user: CurrentUserPayload) {
    const member = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: getCurrentOrganizationId(user),
      },
      select: memberSelect,
    });

    if (!member) {
      throw new NotFoundException('User not found');
    }

    return member;
  }

  private async getValidManager(managerId: string, user: CurrentUserPayload) {
    const manager = await this.prisma.user.findFirst({
      where: {
        id: managerId,
        organizationId: getCurrentOrganizationId(user),
        isActive: true,
        role: {
          in: [UserRole.ADMIN, UserRole.MANAGER],
        },
      },
      select: {
        id: true,
      },
    });

    if (!manager) {
      throw new BadRequestException('Team manager must be an active ADMIN or MANAGER');
    }

    return manager;
  }

  private async syncLegacyTeamForMembers(teamId: string, code: string) {
    await this.prisma.user.updateMany({
      where: { teamId },
      data: { team: code },
    });
  }

  private toTeamResponse<T extends {
    _count?: { members: number };
  }>(team: T) {
    const { _count, ...rest } = team;

    return {
      ...rest,
      memberCount: _count?.members ?? 0,
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

  private assertCanView(user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('You do not have access to teams');
    }
  }

  private assertAdmin(user: CurrentUserPayload) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage teams');
    }
  }
}
