import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotaMetric, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { FindUsersDto } from './dto/find-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { FindOwnerOptionsDto } from './dto/find-owner-options.dto';
import { FindAssigneeOptionsDto } from './dto/find-assignee-options.dto';
import { OrganizationMembershipsService } from '../organization-memberships/organization-memberships.service';
import { QuotaService } from '../quota/quota.service';
import { ProfileMediaService } from '../profile-media/profile-media.service';

const safeUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  roleId: true,
  assignedRole: {
    select: {
      id: true,
      code: true,
      name: true,
      baseRole: true,
      isSystem: true,
      isActive: true,
    },
  },
  team: true,
  teamId: true,
  teamRef: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
  isActive: true,
  avatarObjectKey: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const ownerOptionSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  roleId: true,
  teamId: true,
  team: true,
  avatarObjectKey: true,
  teamRef: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private memberships: OrganizationMembershipsService,
    private quota: QuotaService,
    private readonly profileMedia: ProfileMediaService,
  ) {}

  private canManageAvatar(id: string, actor: CurrentUserPayload) {
    return id === actor.userId || actor.tenantContext?.permissions.includes('user:manage');
  }

  private canViewAvatar(id: string, actor: CurrentUserPayload) {
    return this.canManageAvatar(id, actor) || actor.tenantContext?.permissions.includes('user:view');
  }

  async getAvatar(id: string, actor: CurrentUserPayload) {
    if (!this.canViewAvatar(id, actor)) throw new ForbiddenException('شما اجازه مشاهده این تصویر را ندارید');
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(actor) },
      select: { avatarObjectKey: true, avatarStoragePath: true, avatarBucket: true, avatarMimeType: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.avatarObjectKey || !user.avatarMimeType) throw new NotFoundException('User avatar not found');
    return { mimeType: user.avatarMimeType, stream: await this.profileMedia.getStream({ objectKey: user.avatarObjectKey, storagePath: user.avatarStoragePath, bucket: user.avatarBucket }) };
  }

  async updateAvatar(id: string, file: Express.Multer.File | undefined, actor: CurrentUserPayload) {
    if (!this.canManageAvatar(id, actor)) throw new ForbiddenException('شما اجازه تغییر این تصویر را ندارید');
    const organizationId = getCurrentOrganizationId(actor);
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    const saved = await this.profileMedia.save('users', id, file);
    const updated = await this.prisma.user.update({
        where: { id },
        data: { avatarStorageProvider: saved.storageProvider, avatarBucket: saved.bucket, avatarObjectKey: saved.objectKey, avatarStoragePath: saved.storagePath, avatarMimeType: saved.mimeType, avatarOriginalName: saved.originalName },
        select: safeUserSelect,
      }).catch(async (error) => {
      await this.profileMedia.delete(saved);
      throw error;
    });
    await this.profileMedia.delete({ objectKey: user.avatarObjectKey, storagePath: user.avatarStoragePath, bucket: user.avatarBucket }).catch(() => undefined);
    await this.audit.record({ actorId: actor.userId, organizationId, entityType: 'user', entityId: id, action: 'user.avatar_updated' });
    return updated;
  }

  async removeAvatar(id: string, actor: CurrentUserPayload) {
    if (!this.canManageAvatar(id, actor)) throw new ForbiddenException('شما اجازه تغییر این تصویر را ندارید');
    const organizationId = getCurrentOrganizationId(actor);
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarStorageProvider: null, avatarBucket: null, avatarObjectKey: null, avatarStoragePath: null, avatarMimeType: null, avatarOriginalName: null },
      select: safeUserSelect,
    });
    await this.profileMedia.delete({ objectKey: user.avatarObjectKey, storagePath: user.avatarStoragePath, bucket: user.avatarBucket }).catch(() => undefined);
    await this.audit.record({ actorId: actor.userId, organizationId, entityType: 'user', entityId: id, action: 'user.avatar_removed' });
    return updated;
  }

  async create(dto: CreateUserDto, actor?: CurrentUserPayload) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const teamAssignment = await this.resolveTeamAssignment(
      dto.teamId,
      dto.team,
      actor,
    );
    const organizationId = actor ? getCurrentOrganizationId(actor) : null;
    const reservation = organizationId
      ? await this.quota.reserve(
          organizationId,
          QuotaMetric.ACTIVE_USERS,
          1n,
          `user:create:${randomUUID()}`,
          new Date(),
          actor?.userId,
          actor?.tenantContext?.requestId,
        )
      : null;

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            fullName: dto.fullName,
            email: dto.email,
            passwordHash,
            role: dto.role,
            team: teamAssignment.team,
            teamId: teamAssignment.teamId,
            organizationId: actor ? getCurrentOrganizationId(actor) : undefined,
          },
        });
        await this.memberships.createInitialMembership(tx, created);
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          select: safeUserSelect,
        });
      });
    } catch (error) {
      if (reservation)
        await this.quota.releaseReservation(reservation.reservationId);
      throw error;
    }
    if (reservation)
      await this.quota.commitReservation(reservation.reservationId);

    await this.audit.record({
      actorId: actor?.userId,
      entityType: 'user',
      entityId: user.id,
      action: 'user.created',
      after: user,
    });

    return user;
  }

  async findAll(query: FindUsersDto, actor: CurrentUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const and: Prisma.UserWhereInput[] = [
      { organizationId: getCurrentOrganizationId(actor) },
    ];

    if (query.role) and.push({ role: query.role });
    if (query.teamId) and.push({ teamId: query.teamId });
    if (query.team?.trim()) {
      const team = query.team.trim();
      and.push({
        OR: [
          { team },
          { teamRef: { code: { equals: team, mode: 'insensitive' } } },
          { teamRef: { name: { equals: team, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    if (search) {
      and.push({
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
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

  getOwnerOptions(user: CurrentUserPayload) {
    return this.prisma.user.findMany({
      where: {
        organizationId: getCurrentOrganizationId(user),
        isActive: true,
        role: { in: [UserRole.REP, UserRole.MANAGER] },
      },
      select: ownerOptionSelect,
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
    });
  }

  async findOwnerOptions(user: CurrentUserPayload, query: FindOwnerOptionsDto) {
    const organizationId = getCurrentOrganizationId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();

    if (query.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: query.teamId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!team) throw new NotFoundException('Team not found');
    }

    const where: Prisma.UserWhereInput = {
      organizationId,
      isActive: true,
      role: { in: [UserRole.REP, UserRole.MANAGER] },
      ...(query.teamId && { teamId: query.teamId }),
    };
    if (query.selectedId) {
      where.id = query.selectedId;
    } else if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ownerOptionSelect,
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
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

  async findAssigneeOptions(
    user: CurrentUserPayload,
    query: FindAssigneeOptionsDto,
  ) {
    const page = query.page ?? 1,
      limit = query.limit ?? 25,
      search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      organizationId: getCurrentOrganizationId(user),
      isActive: true,
      ...(query.teamId && { teamId: query.teamId }),
      ...(query.selectedId
        ? { id: query.selectedId }
        : search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ownerOptionSelect,
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
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

  async findOne(id: string, actor: CurrentUserPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(actor) },
      select: safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deactivate(id: string, actor: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: { isActive: false },
        select: safeUserSelect,
      });
      await this.memberships.suspendForUser(tx, id, organizationId);
      await tx.organization.update({
        where: { id: organizationId },
        data: { authorizationVersion: { increment: 1 } },
      });
      return result;
    });
    await this.quota.synchronizeInventory(
      organizationId,
      QuotaMetric.ACTIVE_USERS,
    );

    await this.audit.record({
      actorId: actor.userId,
      organizationId,
      entityType: 'user',
      entityId: id,
      action: 'user.deactivated',
      before: user,
      after: updated,
    });

    return updated;
  }

  async activate(id: string, actor: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isActive) {
      throw new BadRequestException('User is already active');
    }

    const reservation = await this.quota.reserve(
      organizationId,
      QuotaMetric.ACTIVE_USERS,
      1n,
      `user:activate:${id}`,
      new Date(),
      actor.userId,
      actor.tenantContext?.requestId,
    );
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.user.update({
          where: { id },
          data: { isActive: true },
          select: safeUserSelect,
        });
        await this.memberships.activateForUser(tx, id, organizationId);
        await tx.organization.update({
          where: { id: organizationId },
          data: { authorizationVersion: { increment: 1 } },
        });
        return result;
      });
    } catch (error) {
      await this.quota.releaseReservation(reservation.reservationId);
      throw error;
    }
    await this.quota.commitReservation(reservation.reservationId);

    await this.audit.record({
      actorId: actor.userId,
      organizationId,
      entityType: 'user',
      entityId: id,
      action: 'user.activated',
      before: user,
      after: updated,
    });

    return updated;
  }

  async updateUserRole(
    id: string,
    dto: UpdateUserRoleDto,
    actor?: CurrentUserPayload,
  ) {
    if (!dto.role && !dto.roleId) {
      throw new BadRequestException('role or roleId is required');
    }
    const organizationId = actor ? getCurrentOrganizationId(actor) : undefined;
    const user = await this.prisma.user.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: { ownedCompanies: { select: { id: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const assignedRole = dto.roleId
      ? await this.prisma.role.findFirst({
          where: { id: dto.roleId, isActive: true },
          include: { permissions: { include: { permission: true } } },
        })
      : null;
    if (dto.roleId && !assignedRole)
      throw new BadRequestException('Role does not exist or is inactive');
    const nextBaseRole = assignedRole?.baseRole ?? dto.role ?? user.role;
    if (actor?.userId === id && user.role === UserRole.ADMIN && assignedRole) {
      const actions = new Set(
        assignedRole.permissions.map((item) => item.permission.action),
      );
      if (!actions.has('permission:manage') || !actions.has('role:manage'))
        throw new BadRequestException(
          'You cannot remove your own RBAC management access',
        );
    }

    const teamAssignment = await this.resolveTeamAssignment(
      dto.teamId,
      dto.team,
      actor,
      {
        teamId: user.teamId,
        team: user.team,
      },
    );

    if (
      nextBaseRole === UserRole.MANAGER &&
      user.ownedCompanies.length > 0 &&
      !teamAssignment.teamId &&
      !teamAssignment.team
    ) {
      throw new BadRequestException(
        'A manager with owned companies must have a team',
      );
    }

    const nextRoleId = assignedRole?.id ?? (dto.role ? null : user.roleId);
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          role: nextBaseRole,
          roleId: nextRoleId,
          team: teamAssignment.team,
          teamId: teamAssignment.teamId,
        },
        select: safeUserSelect,
      });
      await this.memberships.syncDefaultAssignment(
        tx,
        id,
        user.organizationId,
        nextRoleId,
        teamAssignment.teamId,
      );
      await tx.organization.update({
        where: { id: user.organizationId },
        data: { authorizationVersion: { increment: 1 } },
      });
      return result;
    });

    PermissionsGuard.clearCache(nextBaseRole);
    if (assignedRole) PermissionsGuard.clearCache(`role:${assignedRole.id}`);
    PermissionsGuard.clearCache(user.role);

    await this.audit.record({
      actorId: actor?.userId,
      organizationId,
      entityType: 'user',
      entityId: id,
      action: 'user.role_changed',
      before: user,
      after: updatedUser,
    });

    return updatedUser;
  }

  async resetPassword(
    id: string,
    newPassword: string,
    actor: CurrentUserPayload,
  ) {
    if (id === actor.userId) {
      throw new BadRequestException(
        'برای تغییر رمز حساب خود از بخش امنیت حساب استفاده کنید',
      );
    }

    const organizationId = getCurrentOrganizationId(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: { id: true, fullName: true, email: true, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();
    const [, revoked] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        select: { id: true },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET_BY_ADMIN' },
      }),
    ]);

    await this.audit.record({
      actorId: actor.userId,
      organizationId,
      entityType: 'user',
      entityId: id,
      action: 'user.password_reset',
      after: { sessionsRevoked: revoked.count },
    });

    return {
      success: true,
      revokedSessions: revoked.count,
      message: 'رمز عبور کاربر ریست شد و نشست‌های فعال او پایان یافت.',
    };
  }

  private async resolveTeamAssignment(
    teamId: string | null | undefined,
    legacyTeam: string | undefined,
    actor?: CurrentUserPayload,
    current: { teamId: string | null; team: string | null } = {
      teamId: null,
      team: null,
    },
  ): Promise<{ teamId: string | null; team: string | null }> {
    if (teamId !== undefined) {
      if (teamId === null) {
        return {
          teamId: null,
          team: legacyTeam !== undefined ? legacyTeam.trim() || null : null,
        };
      }

      const team = await this.prisma.team.findFirst({
        where: {
          id: teamId,
          isActive: true,
          ...(actor && { organizationId: getCurrentOrganizationId(actor) }),
        },
      });

      if (!team) {
        throw new BadRequestException('Selected team is invalid or inactive');
      }

      return {
        teamId: team.id,
        team: team.code,
      };
    }

    if (legacyTeam !== undefined) {
      return {
        teamId: current.teamId,
        team: legacyTeam.trim() || null,
      };
    }

    return current;
  }
}
