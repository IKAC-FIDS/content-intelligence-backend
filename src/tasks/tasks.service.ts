import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
  FileAttachmentEntityType,
  Prisma,
  TaskAssignmentScope,
  TaskReviewDecision,
  TaskReviewStatus,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import { NotificationCoreService } from '../notification-core/notification-core.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTaskDto } from './dto/assign-task.dto';
import { ChangeTaskStatusDto } from './dto/change-task-status.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksDto } from './dto/find-tasks.dto';
import { RescheduleTaskDto } from './dto/reschedule-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ReassignTaskDto } from './dto/reassign-task.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { FindTaskEntityOptionsDto, FindTaskOptionsDto } from './dto/find-task-options.dto';
import { getCurrentOrganizationId, tenantScope } from '../common/tenant/tenant-scope.util';
import { currentUserTeamWhere, userTeamScopeWhere } from '../common/tenant/team-scope.util';
import { parseApiDate, parseApiDateRange } from '../common/dates/api-date.util';
import { SubmitTaskReviewDto, TaskReviewDecisionDto } from './dto/task-review.dto';
import { CompanyAccessService } from '../companies/company-access.service';

const taskInclude = {
  company: {
    select: {
      id: true,
      legalName: true,
      brandName: true,
      ownerId: true,
    },
  },
  person: {
    select: {
      id: true,
      fullName: true,
      title: true,
      companyId: true,
    },
  },
  opportunity: {
    select: {
      id: true,
      title: true,
      companyId: true,
      ownerId: true,
      priority: true,
      archivedAt: true,
    },
  },
  commercialDocument: {
    select: {
      id: true,
      type: true,
      status: true,
      number: true,
      title: true,
      opportunityId: true,
    },
  },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      dueDate: true,
      opportunityId: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      team: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  completedBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  reviewer: { select: { id: true, fullName: true, email: true } },
  reviewRounds: {
    take: 1,
    orderBy: { roundNumber: 'desc' as const },
    select: {
      id: true, roundNumber: true, decision: true, submittedAt: true,
      reviewedAt: true, reviewComment: true, submissionNote: true,
      reviewer: { select: { id: true, fullName: true, email: true } },
      submittedBy: { select: { id: true, fullName: true, email: true } },
    },
  },
  team: { select: { id: true, code: true, name: true, isActive: true } },
  meeting: { select: { id: true, title: true, startAt: true, status: true } },
  activity: { select: { id: true, type: true, occurredAt: true, companyId: true } },
  product: { select: { id: true, code: true, name: true, isActive: true } },
  parentTask: { select: { id: true, title: true, status: true } },
  subtasks: {
    select: {
      id: true, title: true, status: true, priority: true, dueAt: true,
      assignedTo: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: [{ status: 'asc' as const }, { dueAt: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  _count: { select: { subtasks: true, reviewRounds: true } },
} satisfies Prisma.TaskInclude;

type TaskRelationDto = {
  companyId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
  commercialDocumentId?: string | null;
  paymentId?: string | null;
  meetingId?: string | null;
  activityId?: string | null;
  productId?: string | null;
};

type ScopedCompany = {
  id: string;
};

type ScopedOpportunity = {
  id: string;
  companyId: string;
  archivedAt: Date | null;
};

type ScopedPerson = {
  id: string;
  companyId: string;
};

type ScopedCommercialDocument = {
  id: string;
  opportunityId: string;
  opportunity: ScopedOpportunity;
};

type ScopedPayment = {
  id: string;
  opportunityId: string;
  commercialDocumentId: string | null;
  opportunity: ScopedOpportunity;
};

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: typeof taskInclude;
}>;

type TaskRelationResolution = {
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
  commercialDocumentId: string | null;
  paymentId: string | null;
  meetingId: string | null;
  activityId: string | null;
  productId: string | null;
};

type AssignmentResolution = {
  assignmentScope: TaskAssignmentScope;
  teamId: string | null;
  assignedToId: string | null;
};

type AssignmentOperation = 'create' | 'update' | 'assign' | 'reassign' | 'subtask';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly notificationCore: NotificationCoreService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async findAll(query: FindTasksDto, user: CurrentUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = this.buildWhere(query, user);

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: [
          { dueAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
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

  async findOne(id: string, user: CurrentUserPayload) {
    const task = await this.getTaskInScope(id, user);

    return task;
  }

  async assertReadable(id: string, user: CurrentUserPayload) {
    return this.getTaskInScope(id, user);
  }

  async findTeamOptions(query: FindTaskOptionsDto, user: CurrentUserPayload) {
    const page = query.page ?? 1, limit = query.limit ?? 25, search = query.search?.trim();
    const where: Prisma.TeamWhereInput = {
      organizationId: getCurrentOrganizationId(user), isActive: true,
      ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.team.findMany({ where, select: { id: true, name: true, code: true, _count: { select: { members: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.team.count({ where }),
    ]);
    return this.optionPage(rows.map((row) => ({ id: row.id, label: row.name, secondary: `${row.code} · ${row._count.members} عضو` })), total, page, limit);
  }

  async findEntityOptions(query: FindTaskEntityOptionsDto, user: CurrentUserPayload) {
    const page = query.page ?? 1, limit = query.limit ?? 25, search = query.search?.trim(), organizationId = getCurrentOrganizationId(user);
    const paging = { skip: (page - 1) * limit, take: limit };
    let data: Array<{ id: string; label: string; secondary?: string }>;
    let total: number;
    if (query.type === 'COMPANY') {
      const where: Prisma.CompanyWhereInput = { AND: [{ organizationId, archivedAt: null }, ...(search ? [{ OR: [{ legalName: { contains: search, mode: 'insensitive' as const } }, { brandName: { contains: search, mode: 'insensitive' as const } }] }] : [])] };
      const [rows, count] = await Promise.all([this.prisma.company.findMany({ where, select: { id: true, legalName: true, brandName: true }, orderBy: { legalName: 'asc' }, ...paging }), this.prisma.company.count({ where })]);
      data = rows.map((row) => ({ id: row.id, label: row.brandName || row.legalName, secondary: row.brandName ? row.legalName : undefined })); total = count;
    } else if (query.type === 'OPPORTUNITY') {
      const where: Prisma.OpportunityWhereInput = { AND: [{ organizationId, archivedAt: null }, this.opportunityScopeWhere(user), ...(search ? [{ title: { contains: search, mode: 'insensitive' as const } }] : [])] };
      const [rows, count] = await Promise.all([this.prisma.opportunity.findMany({ where, select: { id: true, title: true, company: { select: { legalName: true, brandName: true } } }, orderBy: { title: 'asc' }, ...paging }), this.prisma.opportunity.count({ where })]);
      data = rows.map((row) => ({ id: row.id, label: row.title, secondary: row.company.brandName || row.company.legalName })); total = count;
    } else if (query.type === 'PERSON') {
      const where: Prisma.PersonWhereInput = { company: { AND: [{ organizationId }, this.companyScopeWhere(user)] }, ...(search && { fullName: { contains: search, mode: 'insensitive' } }) };
      const [rows, count] = await Promise.all([this.prisma.person.findMany({ where, select: { id: true, fullName: true, title: true }, orderBy: { fullName: 'asc' }, ...paging }), this.prisma.person.count({ where })]);
      data = rows.map((row) => ({ id: row.id, label: row.fullName, secondary: row.title || undefined })); total = count;
    } else if (query.type === 'MEETING') {
      const where: Prisma.MeetingWhereInput = { organizationId, ...(search && { title: { contains: search, mode: 'insensitive' } }) };
      const [rows, count] = await Promise.all([this.prisma.meeting.findMany({ where, select: { id: true, title: true, startAt: true }, orderBy: { startAt: 'desc' }, ...paging }), this.prisma.meeting.count({ where })]);
      data = rows.map((row) => ({ id: row.id, label: row.title, secondary: row.startAt.toISOString() })); total = count;
    } else if (query.type === 'ACTIVITY') {
      const where: Prisma.ActivityWhereInput = { company: { AND: [{ organizationId }, this.companyScopeWhere(user)] }, ...(search && { OR: [{ notes: { contains: search, mode: 'insensitive' } }, { outcome: { contains: search, mode: 'insensitive' } }] }) };
      const [rows, count] = await Promise.all([this.prisma.activity.findMany({ where, select: { id: true, type: true, notes: true, occurredAt: true }, orderBy: { occurredAt: 'desc' }, ...paging }), this.prisma.activity.count({ where })]);
      data = rows.map((row) => ({ id: row.id, label: row.notes?.trim() || row.type, secondary: row.occurredAt.toISOString() })); total = count;
    } else {
      const where: Prisma.ProductCatalogItemWhereInput = { isActive: true, ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] }) };
      const [rows, count] = await Promise.all([this.prisma.productCatalogItem.findMany({ where, select: { id: true, name: true, code: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], ...paging }), this.prisma.productCatalogItem.count({ where })]);
      data = rows.map((row) => ({ id: row.id, label: row.name, secondary: row.code })); total = count;
    }
    return this.optionPage(data, total, page, limit);
  }

  async create(dto: CreateTaskDto, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Tasks are read-only for this role');
    }

    const relations = await this.resolveCreateRelations(dto, user);

    const assignmentInput = {
      assignmentScope: dto.assignmentScope,
      teamId: dto.teamId,
      assigneeId: dto.assignedToId,
    };
    this.assertAssignmentPermission(assignmentInput, user, 'create');
    const assignment = await this.resolveAssignment(assignmentInput, user);

    if (dto.reviewerId && !this.hasPermission(user, 'task:assign-reviewer')) {
      throw new ForbiddenException({ code: 'TASK_REVIEWER_ASSIGN_PERMISSION_REQUIRED', message: 'Assigning a reviewer requires task:assign-reviewer' });
    }
    const requiresReview = dto.requiresReview ?? Boolean(dto.reviewerId);
    if (requiresReview && !dto.reviewerId) {
      throw new BadRequestException({ code: 'TASK_REVIEWER_REQUIRED', message: 'A review-required task must have a reviewer' });
    }
    if (dto.reviewerId) await this.validateReviewer(dto.reviewerId, assignment.assignedToId, user);

    const status = dto.status ?? TaskStatus.TODO;
    if (status === TaskStatus.DONE && requiresReview) this.assertReviewApproved(TaskReviewStatus.DRAFT, true);
    const now = new Date();

    const task = await this.prisma.task.create({
      data: {
        organizationId: getCurrentOrganizationId(user),
        title: this.requiredText(dto.title, 'عنوان کار الزامی است'),
        description: dto.description?.trim() || undefined,
        status,
        priority: dto.priority,
        dueAt: dto.dueAt ? parseApiDate(dto.dueAt, 'dueAt') : undefined,
        reminderAt: dto.reminderAt ? parseApiDate(dto.reminderAt, 'reminderAt') : undefined,
        companyId: relations.companyId ?? undefined,
        personId: relations.personId ?? undefined,
        opportunityId: relations.opportunityId ?? undefined,
        commercialDocumentId: relations.commercialDocumentId ?? undefined,
        paymentId: relations.paymentId ?? undefined,
        meetingId: relations.meetingId ?? undefined,
        activityId: relations.activityId ?? undefined,
        productId: relations.productId ?? undefined,
        assignmentScope: assignment.assignmentScope,
        teamId: assignment.teamId ?? undefined,
        assignedToId: assignment.assignedToId ?? undefined,
        requiresReview,
        reviewStatus: requiresReview ? TaskReviewStatus.DRAFT : TaskReviewStatus.NOT_REQUIRED,
        reviewerId: dto.reviewerId ?? undefined,
        createdById: user.userId,
        completedAt: status === TaskStatus.DONE ? now : undefined,
        completedById: status === TaskStatus.DONE ? user.userId : undefined,
        cancelledAt: status === TaskStatus.CANCELLED ? now : undefined,
      },
      include: taskInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: task.organizationId,
      entityType: 'task',
      entityId: task.id,
      action: 'task.created',
      after: task,
    });
    if (task.requiresReview) {
      await this.audit.record({ actorId: user.userId, organizationId: task.organizationId, entityType: 'task', entityId: task.id, action: 'task.review_required', after: { requiresReview: true, reviewerId: task.reviewerId } });
    }

    await this.notifyTaskAssigned(task, user);
    if (task.reviewerId) await this.notifyReviewUser(task.reviewerId, user, task, 'شما به‌عنوان بازبین کار تعیین شدید', 'REVIEWER_ASSIGNED');

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, user: CurrentUserPayload) {
    const current = await this.getTaskForMutation(id, user);

    const reviewConfigurationChanged = dto.requiresReview !== undefined || dto.reviewerId !== undefined;
    if (reviewConfigurationChanged && !this.hasPermission(user, 'task:assign-reviewer')) {
      throw new ForbiddenException({ code: 'TASK_REVIEWER_ASSIGN_PERMISSION_REQUIRED', message: 'Changing review configuration requires task:assign-reviewer' });
    }
    if (reviewConfigurationChanged && current.reviewStatus === TaskReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException({ code: 'TASK_REVIEW_PENDING', message: 'Reviewer configuration cannot change while a review is pending' });
    }

    const nextRequiresReview = dto.requiresReview ?? current.requiresReview;
    const nextReviewerId = dto.requiresReview === false ? null : (dto.reviewerId ?? current.reviewerId);
    if (nextRequiresReview && !nextReviewerId) {
      throw new BadRequestException({ code: 'TASK_REVIEWER_REQUIRED', message: 'A review-required task must have a reviewer' });
    }
    if (nextReviewerId && (dto.assignedToId ?? current.assignedToId) === nextReviewerId) {
      throw new BadRequestException({ code: 'TASK_SELF_REVIEW_NOT_ALLOWED', message: 'Task assignee cannot review their own work' });
    }
    if (nextReviewerId && nextReviewerId !== current.reviewerId) {
      await this.validateReviewer(nextReviewerId, dto.assignedToId ?? current.assignedToId, user);
    }

    const relations = await this.resolveUpdateRelations(current, dto, user);

    const data: Prisma.TaskUpdateInput = {};

    if (reviewConfigurationChanged) {
      data.requiresReview = nextRequiresReview;
      data.reviewStatus = nextRequiresReview ? TaskReviewStatus.DRAFT : TaskReviewStatus.NOT_REQUIRED;
      data.reviewer = nextReviewerId ? { connect: { id: nextReviewerId } } : { disconnect: true };
    }

    if (dto.title !== undefined) {
      data.title = this.requiredText(dto.title, 'عنوان کار الزامی است');
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.status !== undefined) {
      this.assertStatusTransition(current.status, dto.status);
      if (dto.status === TaskStatus.CANCELLED) {
        throw new BadRequestException({ code: 'TASK_CANCEL_REASON_REQUIRED', message: 'Use the status endpoint and provide a cancellation reason' });
      }
      if (dto.status === TaskStatus.DONE) {
        await this.assertSubtasksResolved(id, current.organizationId);
        this.assertReviewApproved(current.reviewStatus, current.requiresReview);
      }
      Object.assign(data, this.buildStatusUpdate(dto.status, user));
    }

    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }

    if (dto.dueAt !== undefined) {
      data.dueAt = dto.dueAt ? parseApiDate(dto.dueAt, 'dueAt') : null;
    }

    if (dto.reminderAt !== undefined) {
      data.reminderAt = dto.reminderAt ? parseApiDate(dto.reminderAt, 'reminderAt') : null;
    }

    const reviewSensitiveChange = dto.title !== undefined || dto.description !== undefined || this.hasRelationChanges(dto) || dto.assignedToId !== undefined;
    if (!reviewConfigurationChanged && current.requiresReview && current.reviewStatus === TaskReviewStatus.APPROVED && reviewSensitiveChange) {
      data.reviewStatus = TaskReviewStatus.DRAFT;
    }

    if (relations.companyId !== current.companyId) {
      data.company = relations.companyId
        ? { connect: { id: relations.companyId } }
        : { disconnect: true };
    }

    if (relations.personId !== current.personId) {
      data.person = relations.personId
        ? { connect: { id: relations.personId } }
        : { disconnect: true };
    }

    if (relations.opportunityId !== current.opportunityId) {
      data.opportunity = relations.opportunityId
        ? { connect: { id: relations.opportunityId } }
        : { disconnect: true };
    }

    if (relations.commercialDocumentId !== current.commercialDocumentId) {
      data.commercialDocument = relations.commercialDocumentId
        ? { connect: { id: relations.commercialDocumentId } }
        : { disconnect: true };
    }

    if (relations.paymentId !== current.paymentId) {
      data.payment = relations.paymentId
        ? { connect: { id: relations.paymentId } }
        : { disconnect: true };
    }

    if (dto.assignedToId !== undefined || dto.assignmentScope !== undefined || dto.teamId !== undefined) {
      const assignmentInput = {
        assignmentScope: dto.assignmentScope ?? current.assignmentScope,
        teamId: dto.teamId ?? current.teamId ?? undefined,
        assigneeId: dto.assignedToId ?? current.assignedToId ?? undefined,
      };
      this.assertAssignmentPermission(assignmentInput, user, 'update');
      const assignment = await this.resolveAssignment(assignmentInput, user);
      data.assignmentScope = assignment.assignmentScope;
      data.team = assignment.teamId ? { connect: { id: assignment.teamId } } : { disconnect: true };
      data.assignedTo = assignment.assignedToId ? { connect: { id: assignment.assignedToId } } : { disconnect: true };
    }

    if (relations.meetingId !== current.meetingId) {
      data.meeting = relations.meetingId ? { connect: { id: relations.meetingId } } : { disconnect: true };
    }
    if (relations.activityId !== current.activityId) {
      data.activity = relations.activityId ? { connect: { id: relations.activityId } } : { disconnect: true };
    }
    if (relations.productId !== current.productId) {
      data.product = relations.productId ? { connect: { id: relations.productId } } : { disconnect: true };
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: current.organizationId,
      entityType: 'task',
      entityId: id,
      action: 'task.updated',
      before: current,
      after: updated,
    });
    if (reviewConfigurationChanged) {
      await this.audit.record({ actorId: user.userId, organizationId: current.organizationId, entityType: 'task', entityId: id, action: current.reviewerId && current.reviewerId !== updated.reviewerId ? 'task.reviewer_changed' : 'task.reviewer_assigned', before: { requiresReview: current.requiresReview, reviewerId: current.reviewerId }, after: { requiresReview: updated.requiresReview, reviewerId: updated.reviewerId } });
    }

    if (this.hasRelationChanges(dto)) {
      await this.audit.record({
        actorId: user.userId, organizationId: current.organizationId,
        entityType: 'task', entityId: id, action: 'task.linked_entity_changed',
        before: this.relationSnapshot(current), after: this.relationSnapshot(updated),
      });
    }

    if (updated.assignedToId && updated.assignedToId !== current.assignedToId) await this.notifyTaskAssigned(updated, user, current.assignedToId ? 'TASK.REASSIGNED' : 'TASK.ASSIGNED');
    if (updated.reviewerId && updated.reviewerId !== current.reviewerId) await this.notifyReviewUser(updated.reviewerId, user, updated, 'شما به‌عنوان بازبین کار تعیین شدید', 'REVIEWER_ASSIGNED');

    return updated;
  }

  async changeStatus(
    id: string,
    dto: ChangeTaskStatusDto,
    user: CurrentUserPayload,
  ) {
    const current = await this.getTaskForMutation(id, user);

    this.assertStatusTransition(current.status, dto.status);
    if (dto.status === TaskStatus.DONE) {
      await this.assertSubtasksResolved(id, current.organizationId);
      this.assertReviewApproved(current.reviewStatus, current.requiresReview);
    }
    if (dto.status === TaskStatus.CANCELLED && !dto.note?.trim()) {
      throw new BadRequestException({ code: 'TASK_CANCEL_REASON_REQUIRED', message: 'A cancellation reason is required' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changedTask = await tx.task.update({
        where: { id },
        data: {
          ...this.buildStatusUpdate(dto.status, user, dto.note),
          ...(dto.status === TaskStatus.CANCELLED && current.reviewStatus === TaskReviewStatus.PENDING_REVIEW
            ? { reviewStatus: current.requiresReview ? TaskReviewStatus.DRAFT : TaskReviewStatus.NOT_REQUIRED }
            : {}),
        },
        include: taskInclude,
      });
      if (dto.status === TaskStatus.CANCELLED && current.reviewStatus === TaskReviewStatus.PENDING_REVIEW) {
        await tx.taskReviewRound.updateMany({ where: { taskId: id, decision: TaskReviewDecision.PENDING }, data: { decision: TaskReviewDecision.CANCELLED, reviewedAt: new Date(), reviewComment: dto.note?.trim() } });
      }
      return changedTask;
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: current.organizationId,
      entityType: 'task',
      entityId: id,
      action: dto.status === TaskStatus.CANCELLED
        ? 'task.cancelled'
        : dto.status === TaskStatus.DONE
          ? 'task.completed'
          : 'task.status_changed',
      before: {
        status: current.status,
      },
      after: {
        status: updated.status,
      },
      metadata: {
        note: dto.note,
      },
    });

    if (updated.status === TaskStatus.DONE) await this.notifyTaskCompleted(updated, user);
    if (updated.parentTaskId && (updated.status === TaskStatus.DONE || updated.status === TaskStatus.CANCELLED)) {
      await this.notifyParentReady(updated.parentTaskId, updated.organizationId, user);
    }

    return updated;
  }

  async assign(id: string, dto: AssignTaskDto, user: CurrentUserPayload) {
    return this.reassignWithOperation(id, {
      assignmentScope: dto.assignedToId === user.userId ? TaskAssignmentScope.SELF : TaskAssignmentScope.ORGANIZATION,
      assigneeId: dto.assignedToId,
    }, user, 'assign');
  }

  async reassign(id: string, dto: ReassignTaskDto, user: CurrentUserPayload) {
    return this.reassignWithOperation(id, dto, user, 'reassign');
  }

  private async reassignWithOperation(
    id: string,
    dto: ReassignTaskDto,
    user: CurrentUserPayload,
    operation: 'assign' | 'reassign',
  ) {
    const current = await this.getTaskForMutation(id, user);
    this.assertTaskOpen(current.status, 'Completed or cancelled tasks cannot be reassigned');
    this.assertAssignmentPermission(dto, user, operation);
    const assignment = await this.resolveAssignment(dto, user);
    if (current.reviewerId && assignment.assignedToId === current.reviewerId) {
      throw new BadRequestException({ code: 'TASK_SELF_REVIEW_NOT_ALLOWED', message: 'Task assignee cannot review their own work' });
    }
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        assignmentScope: assignment.assignmentScope,
        teamId: assignment.teamId,
        assignedToId: assignment.assignedToId,
        ...(current.requiresReview && current.reviewStatus === TaskReviewStatus.APPROVED ? { reviewStatus: TaskReviewStatus.DRAFT } : {}),
      },
      include: taskInclude,
    });
    await this.audit.record({
      actorId: user.userId,
      organizationId: current.organizationId,
      entityType: 'task', entityId: id, action: 'task.reassigned',
      before: { assignedToId: current.assignedToId, teamId: current.teamId, assignmentScope: current.assignmentScope },
      after: { assignedToId: updated.assignedToId, teamId: updated.teamId, assignmentScope: updated.assignmentScope },
      metadata: { reason: dto.reason?.trim() || undefined },
    });
    if (updated.assignedToId && updated.assignedToId !== current.assignedToId) await this.notifyTaskAssigned(updated, user, current.assignedToId ? 'TASK.REASSIGNED' : 'TASK.ASSIGNED');
    return updated;
  }

  async findSubtasks(id: string, user: CurrentUserPayload) {
    const parent = await this.getTaskInScope(id, user);
    return this.prisma.task.findMany({
      where: { organizationId: parent.organizationId, parentTaskId: id, ...this.taskScopeWhere(user) },
      include: taskInclude,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createSubtask(id: string, dto: CreateSubtaskDto, user: CurrentUserPayload) {
    const parent = await this.getTaskForMutation(id, user);
    this.assertTaskOpen(parent.status, 'Closed tasks cannot receive subtasks');
    const depth = await this.taskDepth(parent);
    if (depth >= 3) throw new BadRequestException({ code: 'TASK_MAX_DEPTH_EXCEEDED', message: 'Task hierarchy is limited to 3 levels' });
    const assignmentInput = {
      assignmentScope: dto.assignmentScope,
      teamId: dto.teamId,
      assigneeId: dto.assigneeId,
    };
    this.assertAssignmentPermission(assignmentInput, user, 'subtask');
    const assignment = await this.resolveAssignment(assignmentInput, user);
    const inherited = dto.inheritLinkedEntity !== false;
    const child = await this.prisma.task.create({
      data: {
        organizationId: parent.organizationId,
        parentTaskId: parent.id,
        title: this.requiredText(dto.title, 'عنوان کار الزامی است'),
        description: dto.description?.trim() || undefined,
        priority: dto.priority ?? parent.priority,
        dueAt: dto.dueAt ? parseApiDate(dto.dueAt, 'dueAt') : undefined,
        assignmentScope: assignment.assignmentScope,
        teamId: assignment.teamId,
        assignedToId: assignment.assignedToId,
        createdById: user.userId,
        ...(inherited && {
          companyId: parent.companyId, personId: parent.personId, opportunityId: parent.opportunityId,
          commercialDocumentId: parent.commercialDocumentId, paymentId: parent.paymentId,
          meetingId: parent.meetingId, activityId: parent.activityId, productId: parent.productId,
        }),
      },
      include: taskInclude,
    });
    await this.audit.record({
      actorId: user.userId, organizationId: parent.organizationId,
      entityType: 'task', entityId: parent.id, action: 'task.subtask_created',
      after: { subtaskId: child.id, assigneeId: child.assignedToId, assignmentScope: child.assignmentScope },
    });
    await this.notifyTaskAssigned(child, user);
    return child;
  }

  async complete(id: string, dto: CompleteTaskDto, user: CurrentUserPayload) {
    const current = await this.getTaskForMutation(id, user);
    this.assertStatusTransition(current.status, TaskStatus.DONE);
    await this.assertSubtasksResolved(id, current.organizationId);
    this.assertReviewApproved(current.reviewStatus, current.requiresReview);

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.DONE,
        completedAt: new Date(),
        completedBy: {
          connect: {
            id: user.userId,
          },
        },
        completionNote: dto.completionNote?.trim() || null,
        cancelledAt: null,
        cancelReason: null,
      },
      include: taskInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: current.organizationId,
      entityType: 'task',
      entityId: id,
      action: 'task.completed',
      before: current,
      after: updated,
    });

    await this.notifyTaskCompleted(updated, user);
    if (updated.parentTaskId) await this.notifyParentReady(updated.parentTaskId, updated.organizationId, user);

    return updated;
  }

  async findReviews(id: string, user: CurrentUserPayload) {
    const task = await this.getTaskInScope(id, user);
    return this.prisma.taskReviewRound.findMany({
      where: { taskId: task.id, organizationId: task.organizationId },
      include: {
        reviewer: { select: { id: true, fullName: true, email: true } },
        submittedBy: { select: { id: true, fullName: true, email: true } },
        artifacts: { include: { artifact: { select: { id: true, name: true, type: true, provider: true, mimeType: true, sizeBytes: true, externalUrl: true } } } },
      },
      orderBy: { roundNumber: 'desc' },
    });
  }

  async submitReview(id: string, dto: SubmitTaskReviewDto, user: CurrentUserPayload) {
    if (!this.hasPermission(user, 'task:submit-review')) throw new ForbiddenException('task:submit-review permission is required');
    const task = await this.getTaskForMutation(id, user);
    this.assertTaskOpen(task.status, 'Closed tasks cannot be submitted for review');
    if (!task.requiresReview) throw new BadRequestException({ code: 'TASK_REVIEW_NOT_REQUIRED', message: 'This task does not require review' });
    if (task.reviewStatus === TaskReviewStatus.PENDING_REVIEW) throw new ConflictException({ code: 'TASK_REVIEW_ALREADY_PENDING', message: 'A review is already pending' });
    if (task.reviewStatus === TaskReviewStatus.APPROVED) throw new BadRequestException({ code: 'TASK_REVIEW_ALREADY_APPROVED', message: 'Approved work must be materially updated before resubmission' });
    const reviewerId = dto.reviewerId ?? task.reviewerId;
    if (!reviewerId) throw new BadRequestException({ code: 'TASK_REVIEWER_REQUIRED', message: 'A reviewer is required' });
    if (dto.reviewerId && dto.reviewerId !== task.reviewerId && !this.hasPermission(user, 'task:assign-reviewer')) {
      throw new ForbiddenException({ code: 'TASK_REVIEWER_ASSIGN_PERMISSION_REQUIRED', message: 'Changing reviewer requires task:assign-reviewer' });
    }
    await this.validateReviewer(reviewerId, task.assignedToId, user, user.userId);
    const artifactIds = [...new Set(dto.artifactIds ?? [])];
    await this.validateSubmissionArtifacts(task.id, artifactIds, task.organizationId);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.taskReviewRound.aggregate({ where: { taskId: id }, _max: { roundNumber: true } });
        const roundNumber = (latest._max.roundNumber ?? 0) + 1;
        const changed = await tx.task.updateMany({
          where: { id, organizationId: task.organizationId, reviewStatus: { in: [TaskReviewStatus.DRAFT, TaskReviewStatus.CHANGES_REQUESTED] }, status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] } },
          data: { reviewStatus: TaskReviewStatus.PENDING_REVIEW, reviewerId },
        });
        if (changed.count !== 1) throw new ConflictException({ code: 'TASK_REVIEW_STATE_CHANGED', message: 'Task review state changed; refresh and retry' });
        const round = await tx.taskReviewRound.create({ data: {
          organizationId: task.organizationId, taskId: id, roundNumber, reviewerId,
          submittedById: user.userId, submissionNote: dto.note?.trim() || undefined,
          artifacts: artifactIds.length ? { create: artifactIds.map((artifactId) => ({ artifactId, addedById: user.userId })) } : undefined,
        } });
        return round;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const action = result.roundNumber > 1 ? 'task.review_resubmitted' : 'task.review_submitted';
      await this.audit.record({ actorId: user.userId, organizationId: task.organizationId, entityType: 'task', entityId: id, action, metadata: { taskId: id, reviewRoundId: result.id, roundNumber: result.roundNumber, reviewerId, submitterId: user.userId, artifactIds } });
      await this.notifyReviewUser(reviewerId, user, task, result.roundNumber > 1 ? 'کار برای بازبینی مجدد ارسال شد' : 'کار جدیدی منتظر بازبینی شماست', result.roundNumber > 1 ? 'RESUBMITTED' : 'REQUESTED');
      return this.findOne(id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException({ code: 'TASK_REVIEW_CONFLICT', message: 'Concurrent review submission detected; refresh and retry' });
      throw error;
    }
  }

  async decideReview(id: string, decision: 'APPROVED' | 'CHANGES_REQUESTED', dto: TaskReviewDecisionDto, user: CurrentUserPayload) {
    if (!this.hasPermission(user, 'task:review')) throw new ForbiddenException('task:review permission is required');
    const task = await this.getTaskForMutation(id, user);
    this.assertTaskOpen(task.status, 'Closed tasks cannot be reviewed');
    if (task.reviewStatus !== TaskReviewStatus.PENDING_REVIEW) throw new ConflictException({ code: 'TASK_REVIEW_NOT_PENDING', message: 'Task is not pending review' });
    if (task.reviewerId !== user.userId) throw new ForbiddenException({ code: 'TASK_REVIEWER_MISMATCH', message: 'Only the assigned reviewer can decide this review' });
    const comment = dto.comment?.trim();
    if (decision === 'CHANGES_REQUESTED' && !comment) throw new BadRequestException({ code: 'TASK_REVIEW_COMMENT_REQUIRED', message: 'A review comment is required when requesting changes' });

    const pending = await this.prisma.taskReviewRound.findFirst({ where: { taskId: id, organizationId: task.organizationId, decision: TaskReviewDecision.PENDING }, orderBy: { roundNumber: 'desc' } });
    if (!pending) throw new ConflictException({ code: 'TASK_REVIEW_ROUND_NOT_PENDING', message: 'No pending review round was found' });
    const reviewDecision = decision === 'APPROVED' ? TaskReviewDecision.APPROVED : TaskReviewDecision.CHANGES_REQUESTED;
    const reviewStatus = decision === 'APPROVED' ? TaskReviewStatus.APPROVED : TaskReviewStatus.CHANGES_REQUESTED;
    try {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.taskReviewRound.updateMany({ where: { id: pending.id, decision: TaskReviewDecision.PENDING }, data: { decision: reviewDecision, reviewedAt: new Date(), reviewComment: comment || undefined } });
        if (changed.count !== 1) throw new ConflictException({ code: 'TASK_REVIEW_ALREADY_DECIDED', message: 'This review round was already decided' });
        const taskChanged = await tx.task.updateMany({ where: { id, organizationId: task.organizationId, reviewStatus: TaskReviewStatus.PENDING_REVIEW, reviewerId: user.userId }, data: { reviewStatus } });
        if (taskChanged.count !== 1) throw new ConflictException({ code: 'TASK_REVIEW_STATE_CHANGED', message: 'Task review state changed; refresh and retry' });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException({ code: 'TASK_REVIEW_CONFLICT', message: 'Concurrent review decision detected; refresh and retry' });
      }
      throw error;
    }
    await this.audit.record({ actorId: user.userId, organizationId: task.organizationId, entityType: 'task', entityId: id, action: decision === 'APPROVED' ? 'task.review_approved' : 'task.review_changes_requested', metadata: { taskId: id, reviewRoundId: pending.id, roundNumber: pending.roundNumber, reviewerId: user.userId, decision, comment } });
    const recipients = [...new Set([task.assignedToId, pending.submittedById].filter((value): value is string => Boolean(value && value !== user.userId)))];
    await Promise.all(recipients.map((recipientId) => this.notifyReviewUser(recipientId, user, task, decision === 'APPROVED' ? 'بازبینی کار تأیید شد' : 'اصلاحات برای کار درخواست شد', decision)));
    return this.findOne(id, user);
  }

  async reschedule(id: string, dto: RescheduleTaskDto, user: CurrentUserPayload) {
    const current = await this.getTaskForMutation(id, user);

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        dueAt: parseApiDate(dto.dueAt, 'dueAt'),
        reminderAt:
          dto.reminderAt !== undefined ? parseApiDate(dto.reminderAt, 'reminderAt') : undefined,
      },
      include: taskInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: current.organizationId,
      entityType: 'task',
      entityId: id,
      action: 'task.rescheduled',
      before: {
        dueAt: current.dueAt,
        reminderAt: current.reminderAt,
      },
      after: {
        dueAt: updated.dueAt,
        reminderAt: updated.reminderAt,
      },
    });

    await this.notifyTaskRescheduled(updated, user);

    return updated;
  }

  async remove(id: string, user: CurrentUserPayload) {
    const current = await this.getTaskForMutation(id, user);

    const deleted = await this.prisma.task.delete({
      where: { id },
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: current.organizationId,
      entityType: 'task',
      entityId: id,
      action: 'task.deleted',
      before: current,
    });

    return deleted;
  }

  private buildWhere(
    query: FindTasksDto,
    user: CurrentUserPayload,
  ): Prisma.TaskWhereInput {
    if (
      query.overdueOnly === 'true' &&
      query.status &&
      query.status !== TaskStatus.TODO &&
      query.status !== TaskStatus.IN_PROGRESS
    ) {
      throw new BadRequestException('overdueOnly=true is only compatible with TODO or IN_PROGRESS status');
    }
    const and: Prisma.TaskWhereInput[] = [
      {
        organizationId: getCurrentOrganizationId(user),
      },
      this.taskScopeWhere(user),
    ];

    if (query.status) and.push({ status: query.status });
    if (query.overdueOnly === 'true') {
      and.push({
        dueAt: { not: null, lt: new Date() },
        ...(!query.status && { status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } }),
      });
    }
    if (query.priority) and.push({ priority: query.priority });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.createdById) and.push({ createdById: query.createdById });
    if (query.assignmentScope) and.push({ assignmentScope: query.assignmentScope });
    if (query.teamId) and.push({ teamId: query.teamId });
    if (query.parentTaskId) and.push({ parentTaskId: query.parentTaskId });
    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.personId) and.push({ personId: query.personId });
    if (query.opportunityId) and.push({ opportunityId: query.opportunityId });
    if (query.commercialDocumentId) {
      and.push({ commercialDocumentId: query.commercialDocumentId });
    }
    if (query.paymentId) and.push({ paymentId: query.paymentId });
    if (query.meetingId) and.push({ meetingId: query.meetingId });
    if (query.activityId) and.push({ activityId: query.activityId });
    if (query.productId) and.push({ productId: query.productId });
    if (query.reviewStatus) and.push({ reviewStatus: query.reviewStatus });
    if (query.reviewerId) and.push({ reviewerId: query.reviewerId });
    if (query.awaitingMyReview === 'true') {
      if (!this.hasPermission(user, 'task:review')) throw new ForbiddenException('task:review permission is required');
      and.push({ reviewStatus: TaskReviewStatus.PENDING_REVIEW, reviewerId: user.userId });
    }

    if (query.view === 'mine') and.push({ assignedToId: user.userId });
    if (query.view === 'created') and.push({ createdById: user.userId });
    if (query.view === 'team') {
      if (!this.hasPermission(user, 'task:view-team')) throw new ForbiddenException('Team task visibility is not permitted');
      and.push({ assignmentScope: TaskAssignmentScope.TEAM, team: currentUserTeamWhere(user) });
    }
    if (query.view === 'organization') {
      if (!this.hasPermission(user, 'task:view-organization')) throw new ForbiddenException('Organization task visibility is not permitted');
      and.push({ assignmentScope: TaskAssignmentScope.ORGANIZATION });
    }

    if (query.linkedEntityType) {
      const field = {
        COMPANY: 'companyId', OPPORTUNITY: 'opportunityId', PERSON: 'personId',
        MEETING: 'meetingId', ACTIVITY: 'activityId', PRODUCT: 'productId',
      }[query.linkedEntityType] as 'companyId';
      and.push({ [field]: { not: null } });
    }

    const dueRange = parseApiDateRange(query.dueFrom, query.dueTo, 'dueFrom', 'dueTo');
    if (dueRange) {
      and.push({ dueAt: dueRange });
    }

    if (query.dueState) {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      if (query.dueState === 'none') and.push({ dueAt: null });
      if (query.dueState === 'overdue') and.push({ dueAt: { lt: now }, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } });
      if (query.dueState === 'today') and.push({ dueAt: { gte: start, lt: end } });
      if (query.dueState === 'upcoming') and.push({ dueAt: { gte: end }, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } });
      if (query.dueState === 'completed') and.push({ status: { in: [TaskStatus.DONE, TaskStatus.CANCELLED] } });
    }

    const search = query.search?.trim();

    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { company: { legalName: { contains: search, mode: 'insensitive' } } },
          { company: { brandName: { contains: search, mode: 'insensitive' } } },
          { opportunity: { title: { contains: search, mode: 'insensitive' } } },
          { person: { fullName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    return {
      AND: and,
    };
  }

  private async getTaskInScope(id: string, user: CurrentUserPayload) {
    const task = await this.prisma.task.findFirst({
      where: {
        AND: [
          { id },
          { organizationId: getCurrentOrganizationId(user) },
          this.taskScopeWhere(user),
        ],
      },
      include: taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  private async getTaskForMutation(id: string, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Tasks are read-only for this role');
    }

    return this.getTaskInScope(id, user);
  }

  private taskScopeWhere(user: CurrentUserPayload): Prisma.TaskWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (this.hasPermission(user, 'task:view-organization')) return {};

    if (user.role === UserRole.MANAGER) {
      return {
        OR: [
          ...(this.hasPermission(user, 'task:view-team')
            ? [{ assignmentScope: TaskAssignmentScope.TEAM, team: currentUserTeamWhere(user) } as Prisma.TaskWhereInput]
            : []),
          { assignedTo: userTeamScopeWhere(user) },
          { createdBy: userTeamScopeWhere(user) },
          ...(this.hasPermission(user, 'task:review') ? [{ reviewerId: user.userId } as Prisma.TaskWhereInput] : []),
          { company: { owner: userTeamScopeWhere(user) } },
          { opportunity: { company: { owner: userTeamScopeWhere(user) } } },
          { person: { company: { owner: userTeamScopeWhere(user) } } },
          {
            commercialDocument: {
              opportunity: {
                company: {
                  owner: userTeamScopeWhere(user),
                },
              },
            },
          },
          {
            payment: {
              opportunity: {
                company: {
                  owner: userTeamScopeWhere(user),
                },
              },
            },
          },
        ],
      };
    }

    return {
      OR: [
        ...(this.hasPermission(user, 'task:view-team')
          ? [{ assignmentScope: TaskAssignmentScope.TEAM, team: currentUserTeamWhere(user) } as Prisma.TaskWhereInput]
          : []),
        { assignedToId: user.userId },
        { createdById: user.userId },
        ...(this.hasPermission(user, 'task:review') ? [{ reviewerId: user.userId } as Prisma.TaskWhereInput] : []),
        { company: { ownerId: user.userId } },
        {
          opportunity: {
            OR: [
              { ownerId: user.userId },
              { company: { ownerId: user.userId } },
            ],
          },
        },
        { person: { company: { ownerId: user.userId } } },
        {
          commercialDocument: {
            opportunity: {
              OR: [
                { ownerId: user.userId },
                { company: { ownerId: user.userId } },
              ],
            },
          },
        },
        {
          payment: {
            opportunity: {
              OR: [
                { ownerId: user.userId },
                { company: { ownerId: user.userId } },
              ],
            },
          },
        },
      ],
    };
  }

  private async resolveCreateRelations(
    dto: TaskRelationDto,
    user: CurrentUserPayload,
  ): Promise<TaskRelationResolution> {
    return this.resolveRelations(
      {
        companyId: null,
        personId: null,
        opportunityId: null,
        commercialDocumentId: null,
        paymentId: null,
        meetingId: null,
        activityId: null,
        productId: null,
      },
      dto,
      user,
    );
  }

  private async resolveUpdateRelations(
    current: TaskWithRelations,
    dto: TaskRelationDto,
    user: CurrentUserPayload,
  ): Promise<TaskRelationResolution> {
    const currentRelations = {
      companyId: current.companyId,
      personId: current.personId,
      opportunityId: current.opportunityId,
      commercialDocumentId: current.commercialDocumentId,
      paymentId: current.paymentId,
      meetingId: current.meetingId,
      activityId: current.activityId,
      productId: current.productId,
    };

    if (!this.hasRelationChanges(dto)) {
      return currentRelations;
    }

    return this.resolveRelations(
      currentRelations,
      dto,
      user,
      current,
    );
  }

  private async resolveRelations(
    current: TaskRelationResolution,
    dto: TaskRelationDto,
    user: CurrentUserPayload,
    currentTask?: TaskWithRelations,
  ): Promise<TaskRelationResolution> {
    const explicitCompanyId = this.normalizeOptionalRelationId(dto.companyId);
    const explicitPersonId = this.normalizeOptionalRelationId(dto.personId);
    const explicitOpportunityId = this.normalizeOptionalRelationId(dto.opportunityId);
    const explicitDocumentId = this.normalizeOptionalRelationId(dto.commercialDocumentId);
    const explicitPaymentId = this.normalizeOptionalRelationId(dto.paymentId);
    const explicitMeetingId = this.normalizeOptionalRelationId(dto.meetingId);
    const explicitActivityId = this.normalizeOptionalRelationId(dto.activityId);
    const explicitProductId = this.normalizeOptionalRelationId(dto.productId);

    const nextOpportunityId =
      dto.opportunityId !== undefined ? explicitOpportunityId : current.opportunityId;
    const nextPersonId = dto.personId !== undefined ? explicitPersonId : current.personId;
    const nextDocumentId =
      dto.commercialDocumentId !== undefined
        ? explicitDocumentId
        : current.commercialDocumentId;
    const nextPaymentId = dto.paymentId !== undefined ? explicitPaymentId : current.paymentId;
    const nextMeetingId = dto.meetingId !== undefined ? explicitMeetingId : current.meetingId;
    const nextActivityId = dto.activityId !== undefined ? explicitActivityId : current.activityId;
    const nextProductId = dto.productId !== undefined ? explicitProductId : current.productId;

    let nextCompanyId = dto.companyId !== undefined ? explicitCompanyId : current.companyId;
    const opportunity = await this.resolveOpportunityContext(nextOpportunityId, user, currentTask);
    const person = await this.resolvePersonContext(nextPersonId, user, currentTask);
    const document = await this.resolveCommercialDocumentContext(nextDocumentId, user);
    const payment = await this.resolvePaymentContext(nextPaymentId, user);
    if (nextMeetingId) await this.assertMeetingAccess(nextMeetingId, user);
    if (nextActivityId) await this.assertActivityAccess(nextActivityId, user);
    if (nextProductId) await this.assertProductAccess(nextProductId);

    if (opportunity) {
      if (explicitCompanyId && explicitCompanyId !== opportunity.companyId) {
        throw new BadRequestException('Task company must match the selected opportunity company.');
      }

      nextCompanyId = opportunity.companyId;
    } else if (explicitCompanyId) {
      const company = await this.assertCompanyAccess(explicitCompanyId, user);
      nextCompanyId = company.id;
    }

    this.assertRelationConsistency({
      companyId: nextCompanyId,
      opportunity,
      person,
      document,
      payment,
    });

    return {
      companyId: nextCompanyId,
      personId: nextPersonId,
      opportunityId: nextOpportunityId,
      commercialDocumentId: nextDocumentId,
      paymentId: nextPaymentId,
      meetingId: nextMeetingId,
      activityId: nextActivityId,
      productId: nextProductId,
    };
  }

  private normalizeOptionalRelationId(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;

    return value;
  }

  private hasRelationChanges(dto: TaskRelationDto): boolean {
    return (
      dto.companyId !== undefined ||
      dto.personId !== undefined ||
      dto.opportunityId !== undefined ||
      dto.commercialDocumentId !== undefined ||
      dto.paymentId !== undefined
      || dto.meetingId !== undefined
      || dto.activityId !== undefined
      || dto.productId !== undefined
    );
  }

  private async resolveOpportunityContext(
    opportunityId: string | null,
    user: CurrentUserPayload,
    currentTask?: TaskWithRelations,
  ): Promise<ScopedOpportunity | null> {
    if (!opportunityId) return null;

    if (currentTask?.opportunity?.id === opportunityId) {
      return currentTask.opportunity;
    }

    return this.assertOpportunityAccess(opportunityId, user);
  }

  private async resolvePersonContext(
    personId: string | null,
    user: CurrentUserPayload,
    currentTask?: TaskWithRelations,
  ): Promise<ScopedPerson | null> {
    if (!personId) return null;

    if (currentTask?.person?.id === personId) {
      return currentTask.person;
    }

    return this.assertPersonAccess(personId, user);
  }

  private async resolveCommercialDocumentContext(
    documentId: string | null,
    user: CurrentUserPayload,
  ): Promise<ScopedCommercialDocument | null> {
    if (!documentId) return null;

    return this.assertCommercialDocumentAccess(documentId, user);
  }

  private async resolvePaymentContext(
    paymentId: string | null,
    user: CurrentUserPayload,
  ): Promise<ScopedPayment | null> {
    if (!paymentId) return null;

    return this.assertPaymentAccess(paymentId, user);
  }

  private assertRelationConsistency(context: {
    companyId: string | null;
    opportunity: ScopedOpportunity | null;
    person: ScopedPerson | null;
    document: ScopedCommercialDocument | null;
    payment: ScopedPayment | null;
  }) {
    const { companyId, opportunity, person, document, payment } = context;

    if (person && companyId && person.companyId !== companyId) {
      throw new BadRequestException('Selected person does not belong to the task company.');
    }

    if (document) {
      if (opportunity && document.opportunityId !== opportunity.id) {
        throw new BadRequestException(
          'Selected commercial document does not belong to the selected opportunity.',
        );
      }

      if (companyId && document.opportunity.companyId !== companyId) {
        throw new BadRequestException(
          'Selected opportunity is not available or does not belong to the selected company.',
        );
      }
    }

    if (payment) {
      if (opportunity && payment.opportunityId !== opportunity.id) {
        throw new BadRequestException(
          'Selected payment does not belong to the selected opportunity.',
        );
      }

      if (companyId && payment.opportunity.companyId !== companyId) {
        throw new BadRequestException(
          'Selected opportunity is not available or does not belong to the selected company.',
        );
      }

      if (
        document &&
        payment.commercialDocumentId &&
        payment.commercialDocumentId !== document.id
      ) {
        throw new BadRequestException(
          'Selected payment does not belong to the selected commercial document.',
        );
      }
    }
  }

  private async assertCompanyAccess(
    companyId: string,
    user: CurrentUserPayload,
  ): Promise<ScopedCompany> {
    return this.companyAccess.assertCompanyReadable(companyId, user);
  }

  private async assertOpportunityAccess(
    opportunityId: string,
    user: CurrentUserPayload,
  ): Promise<ScopedOpportunity> {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        AND: [
          { id: opportunityId, organizationId: getCurrentOrganizationId(user) },
          this.opportunityScopeWhere(user),
        ],
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    if (opportunity.archivedAt) {
      throw new BadRequestException('Archived opportunities cannot be changed');
    }

    return opportunity;
  }

  private async assertPersonAccess(
    personId: string,
    user: CurrentUserPayload,
  ): Promise<ScopedPerson> {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        company: {
          AND: [
            { organizationId: getCurrentOrganizationId(user) },
            this.companyScopeWhere(user),
          ],
        },
      },
    });

    if (!person) {
      throw new NotFoundException('Person not found');
    }

    return person;
  }

  private async assertCommercialDocumentAccess(
    documentId: string,
    user: CurrentUserPayload,
  ): Promise<ScopedCommercialDocument> {
    const document = await this.prisma.opportunityCommercialDocument.findFirst({
      where: {
        id: documentId,
        opportunity: {
          AND: [
            { organizationId: getCurrentOrganizationId(user) },
            this.opportunityScopeWhere(user),
          ],
        },
      },
      include: {
        opportunity: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Commercial document not found');
    }

    if (document.opportunity.archivedAt) {
      throw new BadRequestException('Archived opportunities cannot be changed');
    }

    return document;
  }

  private async assertPaymentAccess(
    paymentId: string,
    user: CurrentUserPayload,
  ): Promise<ScopedPayment> {
    const payment = await this.prisma.opportunityPayment.findFirst({
      where: {
        id: paymentId,
        opportunity: {
          AND: [
            { organizationId: getCurrentOrganizationId(user) },
            this.opportunityScopeWhere(user),
          ],
        },
      },
      include: {
        opportunity: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.opportunity.archivedAt) {
      throw new BadRequestException('Archived opportunities cannot be changed');
    }

    return payment;
  }

  private async assertMeetingAccess(meetingId: string, user: CurrentUserPayload) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, organizationId: getCurrentOrganizationId(user) },
      select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
  }

  private async assertActivityAccess(activityId: string, user: CurrentUserPayload) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, company: { organizationId: getCurrentOrganizationId(user) } },
      select: { id: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');
  }

  private async assertProductAccess(productId: string) {
    const product = await this.prisma.productCatalogItem.findFirst({
      where: { id: productId, isActive: true }, select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
  }

  private async resolveAssignment(
    input: { assignmentScope?: TaskAssignmentScope; teamId?: string; assigneeId?: string },
    user: CurrentUserPayload,
  ): Promise<AssignmentResolution> {
    const scope = input.assignmentScope
      ?? (input.assigneeId && input.assigneeId !== user.userId ? TaskAssignmentScope.ORGANIZATION : TaskAssignmentScope.SELF);
    if (scope === TaskAssignmentScope.SELF) {
      if (input.teamId) throw new BadRequestException({ code: 'TASK_SELF_TEAM_NOT_ALLOWED', message: 'SELF tasks cannot have a team target' });
      if (input.assigneeId && input.assigneeId !== user.userId) throw new BadRequestException({ code: 'TASK_SELF_ASSIGNEE_INVALID', message: 'SELF tasks must be assigned to the acting user' });
      return { assignmentScope: scope, teamId: null, assignedToId: user.userId };
    }

    let team: { id: string } | null = null;
    if (scope === TaskAssignmentScope.TEAM) {
      if (!input.teamId) throw new BadRequestException({ code: 'TASK_TEAM_REQUIRED', message: 'TEAM assignment requires an active team' });
      team = await this.prisma.team.findFirst({
        where: { id: input.teamId, organizationId: getCurrentOrganizationId(user), isActive: true }, select: { id: true },
      });
      if (!team) throw new BadRequestException({ code: 'TASK_TEAM_INVALID', message: 'Task team must be active and belong to the organization' });
    } else if (input.teamId) {
      throw new BadRequestException({ code: 'TASK_ORGANIZATION_TEAM_NOT_ALLOWED', message: 'ORGANIZATION assignment does not use a team target' });
    }

    const assigneeId = input.assigneeId || null;
    if (assigneeId) {
      const assignee = await this.validateAssignee(assigneeId, user, scope === TaskAssignmentScope.TEAM ? team!.id : undefined);
      if (scope === TaskAssignmentScope.TEAM && assignee.teamId !== team!.id) {
        throw new BadRequestException({ code: 'TASK_ASSIGNEE_TEAM_MISMATCH', message: 'Assignee must belong to the selected team' });
      }
    }
    return { assignmentScope: scope, teamId: team?.id ?? null, assignedToId: assigneeId };
  }

  private assertAssignmentPermission(
    input: { assignmentScope?: TaskAssignmentScope; teamId?: string; assigneeId?: string },
    user: CurrentUserPayload,
    operation: AssignmentOperation,
  ) {
    const scope = input.assignmentScope
      ?? (input.assigneeId && input.assigneeId !== user.userId
        ? TaskAssignmentScope.ORGANIZATION
        : TaskAssignmentScope.SELF);
    const targetsBeyondSelf = scope !== TaskAssignmentScope.SELF
      || Boolean(input.teamId)
      || Boolean(input.assigneeId && input.assigneeId !== user.userId);

    if (operation === 'assign') {
      if (this.hasPermission(user, 'task:assign')) return;
      throw new ForbiddenException({
        code: 'TASK_ASSIGN_PERMISSION_REQUIRED',
        message: 'برای ارجاع کار به کاربر دیگری، دسترسی task:assign لازم است.',
      });
    }

    if (operation === 'reassign' || operation === 'update') {
      if (this.hasPermission(user, 'task:reassign') || this.hasPermission(user, 'task:assign')) return;
      throw new ForbiddenException({
        code: 'TASK_REASSIGN_PERMISSION_REQUIRED',
        message: 'برای تغییر مسئول کار موجود، دسترسی task:reassign لازم است.',
      });
    }

    if (!targetsBeyondSelf || this.hasPermission(user, 'task:assign')) return;
    throw new ForbiddenException({
      code: 'TASK_ASSIGN_PERMISSION_REQUIRED',
      message: 'برای ارجاع کار به کاربران یا دامنه‌های دیگر، دسترسی task:assign لازم است.',
    });
  }

  private assertStatusTransition(from: TaskStatus, to: TaskStatus) {
    if (from === to) return;
    const allowed: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.CANCELLED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE, TaskStatus.CANCELLED],
      [TaskStatus.DONE]: [],
      [TaskStatus.CANCELLED]: [],
    };
    if (!allowed[from].includes(to)) throw new BadRequestException({ code: 'INVALID_TASK_TRANSITION', message: `Task cannot transition from ${from} to ${to}` });
  }

  private assertTaskOpen(status: TaskStatus, message: string) {
    if (status === TaskStatus.DONE || status === TaskStatus.CANCELLED) throw new BadRequestException({ code: 'TASK_CLOSED', message });
  }

  private async assertSubtasksResolved(taskId: string, organizationId: string) {
    const count = await this.prisma.task.count({
      where: { organizationId, parentTaskId: taskId, status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] } },
    });
    if (count) throw new BadRequestException({
      code: 'TASK_INCOMPLETE_SUBTASKS',
      message: `Task cannot be completed while ${count} subtasks are incomplete.`,
      details: { incompleteSubtaskCount: count },
    });
  }

  private async taskDepth(task: { id: string; parentTaskId: string | null; organizationId: string }) {
    let depth = 1;
    let parentId = task.parentTaskId;
    const seen = new Set([task.id]);
    while (parentId) {
      if (seen.has(parentId)) throw new BadRequestException({ code: 'TASK_HIERARCHY_CYCLE', message: 'Circular task hierarchy detected' });
      seen.add(parentId);
      const parent = await this.prisma.task.findFirst({ where: { id: parentId, organizationId: task.organizationId }, select: { parentTaskId: true } });
      if (!parent) throw new BadRequestException({ code: 'TASK_PARENT_INVALID', message: 'Parent task does not belong to the organization' });
      depth += 1;
      parentId = parent.parentTaskId;
      if (depth > 3) break;
    }
    return depth;
  }

  private relationSnapshot(task: TaskRelationResolution) {
    return {
      companyId: task.companyId, personId: task.personId, opportunityId: task.opportunityId,
      commercialDocumentId: task.commercialDocumentId, paymentId: task.paymentId,
      meetingId: task.meetingId, activityId: task.activityId, productId: task.productId,
    };
  }

  private hasPermission(user: CurrentUserPayload, permission: string) {
    return Boolean(user.tenantContext?.permissions?.includes(permission));
  }

  private optionPage<T>(data: T[], total: number, page: number, limit: number) {
    const totalPages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }

  private companyScopeWhere(user: CurrentUserPayload): Prisma.CompanyWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return { owner: userTeamScopeWhere(user) };
    }

    return {
      ownerId: user.userId,
    };
  }

  private opportunityScopeWhere(
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return { company: { owner: userTeamScopeWhere(user) } };
    }

    return {
      OR: [
        {
          ownerId: user.userId,
        },
        {
          company: {
            ownerId: user.userId,
          },
        },
      ],
    };
  }

  private async validateAssignee(
    assignedToId: string,
    user: CurrentUserPayload,
    requiredTeamId?: string,
  ) {
    const assignee = await this.prisma.user.findFirst({
      where: {
        id: assignedToId,
        ...tenantScope.activeMembership(user),
      },
    });

    if (!assignee || !assignee.isActive || assignee.role === UserRole.BOARDS) {
      throw new BadRequestException(
        'Task assignee must be an active internal user',
      );
    }

    if (requiredTeamId && assignee.teamId !== requiredTeamId) {
      throw new BadRequestException({ code: 'TASK_ASSIGNEE_TEAM_MISMATCH', message: 'Assignee must belong to the selected team' });
    }

    return assignee;
  }

  private async validateReviewer(
    reviewerId: string,
    assigneeId: string | null,
    user: CurrentUserPayload,
    submitterId?: string,
  ) {
    if (reviewerId === assigneeId || reviewerId === submitterId) {
      throw new BadRequestException({ code: 'TASK_SELF_REVIEW_NOT_ALLOWED', message: 'Assignee or submitter cannot review their own work' });
    }
    const organizationId = getCurrentOrganizationId(user);
    const reviewer = await this.prisma.user.findFirst({
      where: { id: reviewerId, organizationId, isActive: true, role: { not: UserRole.BOARDS } },
      include: {
        organizationMemberships: {
          where: { organizationId, status: 'ACTIVE' },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!reviewer) throw new BadRequestException({ code: 'TASK_REVIEWER_INVALID', message: 'Reviewer must be an active internal user in the same organization' });
    const membershipAllows = reviewer.organizationMemberships.some((membership) => membership.isTenantOwner || membership.role?.permissions.some((item) => item.permission.isActive && item.permission.action === 'task:review'));
    const legacyAllows = await this.prisma.rolePermission.count({ where: { role: reviewer.role, permission: { action: 'task:review', isActive: true } } });
    if (!membershipAllows && !legacyAllows) throw new BadRequestException({ code: 'TASK_REVIEWER_PERMISSION_REQUIRED', message: 'Reviewer does not have task:review permission' });
    return reviewer;
  }

  private async validateSubmissionArtifacts(taskId: string, artifactIds: string[], organizationId: string) {
    if (!artifactIds.length) return;
    const count = await this.prisma.fileAttachment.count({ where: {
      id: { in: artifactIds }, organizationId, deletedAt: null,
      links: { some: { organizationId, entityType: FileAttachmentEntityType.TASK, entityId: taskId } },
    } });
    if (count !== artifactIds.length) throw new BadRequestException({ code: 'TASK_REVIEW_ARTIFACT_INVALID', message: 'Every submission artifact must be active, tenant-owned and linked to this task' });
  }

  private assertReviewApproved(reviewStatus: TaskReviewStatus, requiresReview: boolean) {
    if (requiresReview && reviewStatus !== TaskReviewStatus.APPROVED) {
      throw new BadRequestException({ code: 'TASK_REVIEW_NOT_APPROVED', message: 'Task cannot be completed until the current review is approved' });
    }
  }

  private async notifyReviewUser(
    recipientId: string,
    user: CurrentUserPayload,
    task: { id: string; title: string; organizationId: string },
    title: string,
    event: string,
  ) {
    await this.notifications.notifyUser({
      organizationId: task.organizationId, recipientId, actorId: user.userId,
      type: NotificationType.TASK_STATUS_CHANGED, priority: NotificationPriority.NORMAL,
      title, body: task.title, entityType: NotificationEntityType.TASK, entityId: task.id,
      actionUrl: `/tasks/${task.id}#review`, metadata: { event }, skipSelf: true,
    });
  }

  private buildStatusUpdate(
    status: TaskStatus,
    user: CurrentUserPayload,
    note?: string,
  ): Prisma.TaskUpdateInput {
    if (status === TaskStatus.DONE) {
      return {
        status,
        completedAt: new Date(),
        completedBy: {
          connect: {
            id: user.userId,
          },
        },
        completionNote: note?.trim() || undefined,
        cancelledAt: null,
        cancelReason: null,
      };
    }

    if (status === TaskStatus.CANCELLED) {
      return {
        status,
        cancelledAt: new Date(),
        cancelReason: note?.trim() || undefined,
        completedAt: null,
        completedBy: {
          disconnect: true,
        },
        completionNote: null,
      };
    }

    return {
      status,
      completedAt: null,
      completedBy: {
        disconnect: true,
      },
      completionNote: null,
      cancelledAt: null,
      cancelReason: null,
    };
  }

  private requiredText(value: string, message: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

private async notifyTaskAssigned(
  task: { id: string; title: string; assignedToId: string | null; updatedAt?: Date },
  user: CurrentUserPayload,
  eventName: 'TASK.ASSIGNED' | 'TASK.REASSIGNED' = 'TASK.ASSIGNED',
) {
  if (!task.assignedToId) return;
  await this.notificationCore.publishDomainEvent({
    organizationId: getCurrentOrganizationId(user), eventName, aggregateType: 'TASK',
    aggregateId: task.id, actorId: user.userId,
    idempotencyKey: `${eventName}:${task.id}:${task.updatedAt?.toISOString() ?? task.assignedToId}`,
    payload: { assigneeUserIds: [task.assignedToId] },
  });
}

private async notifyParentReady(parentTaskId: string, organizationId: string, user: CurrentUserPayload) {
  const [parent, unresolved] = await Promise.all([
    this.prisma.task.findFirst({ where: { id: parentTaskId, organizationId }, select: { id: true, title: true, assignedToId: true } }),
    this.prisma.task.count({ where: { parentTaskId, organizationId, status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] } } }),
  ]);
  if (!parent?.assignedToId || unresolved > 0) return;
  await this.notifications.notifyUser({
    organizationId, recipientId: parent.assignedToId, actorId: user.userId,
    type: NotificationType.TASK_STATUS_CHANGED, priority: NotificationPriority.NORMAL,
    title: 'همه زیرکارها تعیین تکلیف شدند', body: parent.title,
    entityType: NotificationEntityType.TASK, entityId: parent.id,
    actionUrl: `/tasks/${parent.id}`, skipSelf: true,
  });
}

private async notifyTaskCompleted(
  task: { id: string; title: string; createdById: string | null; updatedAt?: Date },
  user: CurrentUserPayload,
) {
  await this.notificationCore.publishDomainEvent({
    organizationId: getCurrentOrganizationId(user), eventName: 'TASK.COMPLETED', aggregateType: 'TASK',
    aggregateId: task.id, actorId: user.userId,
    idempotencyKey: `TASK.COMPLETED:${task.id}:${task.updatedAt?.toISOString() ?? 'completed'}`,
    payload: { creatorUserId: task.createdById },
  });
}

private async notifyTaskRescheduled(
  task: {
    id: string;
    title: string;
    assignedToId: string | null;
    dueAt: Date | null;
  },
  user: CurrentUserPayload,
) {
  if (!task.assignedToId) {
    return;
  }

  await this.notifications.notifyUser({
    organizationId: getCurrentOrganizationId(user),
    recipientId: task.assignedToId,
    actorId: user.userId,
    type: NotificationType.TASK_RESCHEDULED,
    priority: NotificationPriority.NORMAL,
    title: 'زمان‌بندی کار تغییر کرد',
    body: task.title,
    entityType: NotificationEntityType.TASK,
    entityId: task.id,
    actionUrl: `/tasks/${task.id}`,
    metadata: {
      dueAt: task.dueAt?.toISOString() ?? null,
    },
    skipSelf: true,
  });
}
}
