import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActivityTargetType, Prisma, TaskStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CompleteActivityDto } from './dto/complete-activity.dto';
import { RescheduleActivityDto } from './dto/reschedule-activity.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { parseApiDate, parseNullableApiDate } from '../common/dates/api-date.util';
import { CompanyAccessService } from '../companies/company-access.service';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { userTeamFilterWhere, userTeamScopeWhere } from '../common/tenant/team-scope.util';
import { OwnershipScope } from '../common/dto/ownership-scope.dto';
import { parseApiDateRange } from '../common/dates/api-date.util';
import { ActivityListStatus, FindActivitiesDto } from './dto/find-activities.dto';

const activityCenterSelect = {
  id: true,
  targetType: true,
  taskId: true,
  companyId: true,
  personId: true,
  opportunityId: true,
  type: true,
  notes: true,
  outcome: true,
  occurredAt: true,
  nextActionDate: true,
  completedAt: true,
  createdAt: true,
  person: { select: { id: true, fullName: true } },
  company: {
    select: {
      id: true,
      legalName: true,
      brandName: true,
      owner: { select: { id: true, fullName: true, email: true, team: true, teamId: true } },
    },
  },
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      parentTaskId: true,
      parentTask: { select: { id: true, title: true } },
    },
  },
  user: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.ActivitySelect;

@Injectable()
export class ActivitiesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private companyAccess: CompanyAccessService,
  ) {}

  findTypes() {
    return this.prisma.lookupOption.findMany({
      where: { group: 'activity-types' },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  private canViewOrganizationActivities(user: CurrentUserPayload) {
    return Boolean(
      user.tenantContext?.permissions.includes('activity:view-organization'),
    );
  }

  private async validateManualType(type: string) {
    if (type === 'STAGE_CHANGE') throw new BadRequestException('STAGE_CHANGE is a system activity');
    const option = await this.prisma.lookupOption.findFirst({
      where: { group: 'activity-types', code: type, isActive: true },
    });
    if (!option) throw new BadRequestException('نوع فعالیت انتخاب‌شده نامعتبر یا غیرفعال است.');
  }

  async findAll(query: FindActivitiesDto, user: CurrentUserPayload): Promise<PaginatedResponse<any>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.activityCenterWhere(query, user);
    const primaryOrder: Prisma.ActivityOrderByWithRelationInput =
      query.sortBy === 'createdAt'
        ? { createdAt: query.sortOrder ?? 'desc' }
        : { occurredAt: query.sortOrder ?? 'desc' };
    const orderDirection = query.sortOrder ?? 'desc';
    const orderBy: Prisma.ActivityOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [primaryOrder, { id: orderDirection }]
        : [primaryOrder, { createdAt: orderDirection }, { id: orderDirection }];
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        select: activityCenterSelect,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map((row) => this.activityCenterRow(row)),
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
    };
  }

  async latestActivities(user: CurrentUserPayload) {
    const rows = await this.prisma.activity.findMany({
      where: this.activityCenterWhere({}, user),
      select: activityCenterSelect,
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => {
      const mapped = this.activityCenterRow(row);
      return {
        id: mapped.id,
        type: mapped.type,
        title: mapped.title,
        activityDate: mapped.activityDate,
        person: mapped.person,
        company: mapped.company,
        task: mapped.task,
        targetType: mapped.targetType,
        createdBy: mapped.createdBy,
      };
    });
  }

  private activityCenterWhere(query: FindActivitiesDto, user: CurrentUserPayload): Prisma.ActivityWhereInput {
    const organizationId = getCurrentOrganizationId(user);
    const and: Prisma.ActivityWhereInput[] = [
      {
        OR: [
          { company: { organizationId, archivedAt: null } },
          { task: { organizationId } },
        ],
      },
    ];
    if (!this.canViewOrganizationActivities(user)) {
      and.push({ userId: user.userId });
    }
    if (query.activityType) and.push({ type: query.activityType });
    if (query.status === ActivityListStatus.COMPLETED) and.push({ completedAt: { not: null } });
    else if (query.status === ActivityListStatus.RECORDED) and.push({ completedAt: null });
    if (query.ownerId) and.push({ company: { ownerId: query.ownerId } });
    if (query.createdById) and.push({ userId: query.createdById });
    if (query.personId) and.push({ personId: query.personId });
    if (query.companyId) and.push({ companyId: query.companyId });
    const activityDate = parseApiDateRange(query.dateFrom, query.dateTo, 'dateFrom', 'dateTo');
    if (activityDate) and.push({ occurredAt: activityDate });
    if (query.team?.trim()) and.push({ company: { owner: userTeamFilterWhere([query.team], user) } });
    if (query.ownershipScope === OwnershipScope.MINE) and.push({ company: { ownerId: user.userId } });
    else if (query.ownershipScope === OwnershipScope.TEAM) and.push({ company: { owner: userTeamScopeWhere(user) } });
    else if (query.ownershipScope === OwnershipScope.UNASSIGNED) and.push({ company: { ownerId: null } });
    if (query.mine) and.push({ userId: user.userId });
    if (query.unassigned) and.push({ company: { ownerId: null } });
    const search = query.search?.trim();
    if (search) {
      and.push({
        OR: [
          { outcome: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { person: { fullName: { contains: search, mode: 'insensitive' } } },
          { company: { legalName: { contains: search, mode: 'insensitive' } } },
          { company: { brandName: { contains: search, mode: 'insensitive' } } },
          { task: { title: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    return { AND: and };
  }

  private activityCenterRow(row: Prisma.ActivityGetPayload<{ select: typeof activityCenterSelect }>) {
    const company = row.company
      ? (() => {
          const { owner: _owner, ...value } = row.company;
          return value;
        })()
      : null;
    return {
      ...row,
      title: row.outcome ?? row.type,
      description: row.notes,
      status: row.completedAt ? ActivityListStatus.COMPLETED : ActivityListStatus.RECORDED,
      activityDate: row.occurredAt,
      updatedAt: row.createdAt,
      company,
      owner: row.company?.owner ?? null,
      createdBy: row.user,
    };
  }

  private async validateCompanyAccess(companyId: string, user: CurrentUserPayload) {
    await this.companyAccess.assertCompanyMutable(companyId, user);
  }

  private async validatePersonAccess(personId: string, user: CurrentUserPayload) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, company: { organizationId: getCurrentOrganizationId(user) } },
      include: { company: { select: { ownerId: true, owner: { select: { team: true, teamId: true } } } } },
    });
    if (!person) throw new NotFoundException('مخاطب پیدا نشد');
    await this.validateCompanyAccess(person.companyId, user);
    return person;
  }

  private taskScopeWhere(user: CurrentUserPayload): Prisma.TaskWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) return {};
    if (user.role === UserRole.MANAGER) {
      return {
        OR: [
          { assignedTo: userTeamScopeWhere(user) },
          { createdBy: userTeamScopeWhere(user) },
          { company: { owner: userTeamScopeWhere(user) } },
          { opportunity: { company: { owner: userTeamScopeWhere(user) } } },
          { person: { company: { owner: userTeamScopeWhere(user) } } },
        ],
      };
    }
    return {
      OR: [
        { assignedToId: user.userId },
        { createdById: user.userId },
        { company: { ownerId: user.userId } },
        {
          opportunity: {
            OR: [{ ownerId: user.userId }, { company: { ownerId: user.userId } }],
          },
        },
        { person: { company: { ownerId: user.userId } } },
      ],
    };
  }

  private async validateTaskAccess(taskId: string, user: CurrentUserPayload, forCreate = false) {
    const task = await this.prisma.task.findFirst({
      where: {
        AND: [
          { id: taskId, organizationId: getCurrentOrganizationId(user) },
          this.taskScopeWhere(user),
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        companyId: true,
        personId: true,
        opportunityId: true,
        parentTaskId: true,
        company: { select: { id: true, legalName: true, brandName: true } },
        parentTask: { select: { id: true, title: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (forCreate && (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED)) {
      throw new BadRequestException({
        code: 'ACTIVITY_TASK_CLOSED',
        message: 'برای کار تکمیل‌شده یا لغوشده نمی‌توان فعالیت جدید ثبت کرد.',
      });
    }
    return task;
  }

  private async findActivityForMutation(activityId: string, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const activity = await this.prisma.activity.findFirst({
      where: {
        id: activityId,
        OR: [{ company: { organizationId } }, { task: { organizationId } }],
      },
      include: {
        company: true,
        task: true,
        person: true,
        user: { select: { id: true, fullName: true } },
        completedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.targetType === ActivityTargetType.TASK && activity.taskId) {
      await this.validateTaskAccess(activity.taskId, user);
    } else if (activity.companyId) {
      await this.validateCompanyAccess(activity.companyId, user);
    } else {
      throw new ForbiddenException('Activity target is not accessible');
    }
    return activity;
  }

  async assertReadable(activityId: string, user: CurrentUserPayload) {
    const activity = await this.findActivityForMutation(activityId, user);
    if (!this.canViewOrganizationActivities(user) && activity.userId !== user.userId) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  async findByCompany(companyId: string, pagination: PaginationDto, user: CurrentUserPayload): Promise<PaginatedResponse<any>> {
    if (!companyId) throw new BadRequestException('شناسه شرکت الزامی است');
    await this.assertCompanyReadable(companyId, user);
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;
    const activityScope = this.canViewOrganizationActivities(user)
      ? {}
      : { userId: user.userId };
    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where: { companyId, ...activityScope },
        include: {
          person: true,
          task: {
            select: {
              id: true,
              title: true,
              parentTaskId: true,
              parentTask: { select: { id: true, title: true } },
            },
          },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.activity.count({ where: { companyId, ...activityScope } }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
    };
  }

  async findByTask(
    taskId: string,
    pagination: PaginationDto,
    includeSubtasks: boolean,
    user: CurrentUserPayload,
  ): Promise<PaginatedResponse<any>> {
    await this.validateTaskAccess(taskId, user);
    const taskIds = [taskId];
    if (includeSubtasks) {
      let frontier = [taskId];
      for (let depth = 0; depth < 3 && frontier.length; depth += 1) {
        const children = await this.prisma.task.findMany({
          where: { organizationId: getCurrentOrganizationId(user), parentTaskId: { in: frontier } },
          select: { id: true },
        });
        const next = children.map((row) => row.id).filter((id) => !taskIds.includes(id));
        taskIds.push(...next);
        frontier = next;
      }
    }
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.ActivityWhereInput = {
      targetType: ActivityTargetType.TASK,
      taskId: { in: taskIds },
      ...(!this.canViewOrganizationActivities(user) && {
        userId: user.userId,
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        select: activityCenterSelect,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map((row) => this.activityCenterRow(row)),
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
    };
  }

  async create(dto: CreateActivityDto, user: CurrentUserPayload) {
    await this.validateManualType(dto.type);
    const targetType = dto.targetType ?? ActivityTargetType.COMPANY;

    let companyId: string | null = null;
    let taskId: string | null = null;
    let personId = dto.personId;
    let opportunityId = dto.opportunityId;

    if (targetType === ActivityTargetType.COMPANY) {
      if (!dto.companyId) {
        throw new BadRequestException({
          code: 'ACTIVITY_COMPANY_REQUIRED',
          message: 'برای فعالیت شرکتی، انتخاب شرکت الزامی است.',
        });
      }
      if (dto.taskId) {
        throw new BadRequestException({
          code: 'ACTIVITY_TARGET_INVALID',
          message: 'فعالیت شرکتی نمی‌تواند هم‌زمان به کار متصل باشد.',
        });
      }

      companyId = dto.companyId;
      await this.validateCompanyAccess(companyId, user);

      if (personId) {
        const person = await this.validatePersonAccess(personId, user);
        if (person.companyId !== companyId) {
          throw new BadRequestException('Person must belong to the activity company');
        }
      }
      if (opportunityId) {
        await this.validateOpportunityCompany(opportunityId, companyId);
      }
    } else {
      if (!dto.taskId) {
        throw new BadRequestException({
          code: 'ACTIVITY_TASK_REQUIRED',
          message: 'برای فعالیت مرتبط با کار، انتخاب کار الزامی است.',
        });
      }
      if (dto.companyId) {
        throw new BadRequestException({
          code: 'ACTIVITY_TARGET_INVALID',
          message: 'companyId برای فعالیت مبتنی بر کار از سمت سرور تعیین می‌شود.',
        });
      }

      const task = await this.validateTaskAccess(dto.taskId, user, true);
      taskId = task.id;
      companyId = task.companyId ?? null;
      personId = personId ?? task.personId ?? undefined;
      opportunityId = opportunityId ?? task.opportunityId ?? undefined;

      if (personId && companyId) {
        const person = await this.validatePersonAccess(personId, user);
        if (person.companyId !== companyId) {
          throw new BadRequestException('Person must belong to the task company');
        }
      }
      if (opportunityId && companyId) {
        await this.validateOpportunityCompany(opportunityId, companyId);
      }
    }

    const activity = await this.prisma.activity.create({
      data: {
        targetType,
        companyId,
        taskId,
        personId,
        userId: user.userId,
        type: dto.type,
        notes: dto.notes,
        outcome: dto.outcome,
        occurredAt: dto.occurredAt ? parseApiDate(dto.occurredAt, 'occurredAt') : undefined,
        nextActionDate: dto.nextActionDate ? parseApiDate(dto.nextActionDate, 'nextActionDate') : undefined,
        opportunityId,
      },
      include: {
        company: true,
        task: {
          select: {
            id: true,
            title: true,
            parentTaskId: true,
            parentTask: { select: { id: true, title: true } },
          },
        },
        person: true,
        user: { select: { id: true, fullName: true } },
      },
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'activity',
      entityId: activity.id,
      action: 'activity.created',
      after: activity,
      metadata: { targetType, companyId, taskId },
    });
    return activity;
  }

  private async assertCompanyReadable(companyId: string, user: CurrentUserPayload): Promise<void> {
    await this.companyAccess.assertCompanyReadable(companyId, user);
  }

  async updateActivity(activityId: string, dto: UpdateActivityDto, user: CurrentUserPayload) {
    const activity = await this.findActivityForMutation(activityId, user);
    if (dto.type !== undefined && dto.type !== activity.type) {
      await this.validateManualType(dto.type);
    }

    if (activity.type === 'STAGE_CHANGE') {
      throw new BadRequestException('STAGE_CHANGE activities cannot be edited manually');
    }
    if (dto.type === 'STAGE_CHANGE') {
      throw new BadRequestException('Activity type cannot be changed to STAGE_CHANGE manually');
    }

    if (dto.personId) {
      const person = await this.validatePersonAccess(dto.personId, user);
      if (activity.companyId && person.companyId !== activity.companyId) {
        throw new BadRequestException('Person must belong to the activity company');
      }
    }
    if (dto.opportunityId && activity.companyId) {
      await this.validateOpportunityCompany(dto.opportunityId, activity.companyId);
    }

    const updated = await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.personId !== undefined && { personId: dto.personId }),
        ...(dto.occurredAt != null && { occurredAt: parseApiDate(dto.occurredAt, 'occurredAt') }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.outcome !== undefined && { outcome: dto.outcome }),
        ...(dto.nextActionDate !== undefined && {
          nextActionDate: parseNullableApiDate(dto.nextActionDate, 'nextActionDate'),
        }),
        ...(dto.opportunityId !== undefined && { opportunityId: dto.opportunityId }),
      },
      include: {
        company: true,
        task: true,
        person: true,
        user: { select: { id: true, fullName: true } },
        completedBy: { select: { id: true, fullName: true } },
      },
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'activity',
      entityId: activityId,
      action: 'activity.updated',
      before: activity,
      after: updated,
    });
    return updated;
  }

  async completeActivity(activityId: string, dto: CompleteActivityDto, user: CurrentUserPayload) {
    const activity = await this.findActivityForMutation(activityId, user);
    if (!activity.nextActionDate) {
      throw new BadRequestException('Only activities with a follow-up date can be completed');
    }
    if (activity.completedAt) return activity;

    const completed = await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        completedAt: new Date(),
        completedById: user.userId,
        completionNote: dto.completionNote,
        ...(dto.outcome !== undefined && { outcome: dto.outcome }),
      },
      include: {
        company: true,
        task: true,
        person: true,
        user: { select: { id: true, fullName: true } },
        completedBy: { select: { id: true, fullName: true } },
      },
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'activity',
      entityId: activityId,
      action: 'follow-up.completed',
      before: activity,
      after: completed,
    });
    return completed;
  }

  async rescheduleActivity(activityId: string, dto: RescheduleActivityDto, user: CurrentUserPayload) {
    const activity = await this.findActivityForMutation(activityId, user);
    if (activity.completedAt) {
      throw new BadRequestException('Completed follow-ups cannot be rescheduled');
    }

    const nextActionDate = parseApiDate(dto.nextActionDate, 'nextActionDate');
    if (nextActionDate <= new Date()) {
      throw new BadRequestException('nextActionDate must be in the future');
    }
    const note = dto.note?.trim();
    const notes = note
      ? [activity.notes, `[Rescheduled] ${note}`].filter(Boolean).join('\n')
      : activity.notes;

    const rescheduled = await this.prisma.activity.update({
      where: { id: activityId },
      data: { nextActionDate, notes },
      include: {
        company: true,
        task: true,
        person: true,
        user: { select: { id: true, fullName: true } },
        completedBy: { select: { id: true, fullName: true } },
      },
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'activity',
      entityId: activityId,
      action: 'follow-up.rescheduled',
      before: activity,
      after: rescheduled,
    });
    return rescheduled;
  }

  async findDueFollowUps(user: CurrentUserPayload, pagination: PaginationDto): Promise<PaginatedResponse<any>> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;
    const organizationId = getCurrentOrganizationId(user);

    const where: Prisma.ActivityWhereInput = {
      userId: user.userId,
      OR: [{ company: { organizationId } }, { task: { organizationId } }],
      nextActionDate: { lte: new Date() },
      completedAt: null,
    };

    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: {
          company: { select: { id: true, legalName: true } },
          task: { select: { id: true, title: true } },
          person: true,
        },
        orderBy: { nextActionDate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
    };
  }

  private async validateOpportunityCompany(opportunityId: string, companyId: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { companyId: true },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
  }
}
