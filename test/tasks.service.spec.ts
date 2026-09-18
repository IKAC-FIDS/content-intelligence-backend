import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Priority, TaskAssignmentScope, TaskStatus, UserRole } from '@prisma/client';
import { TasksService } from '../src/tasks/tasks.service';
import type { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
function actor(role: UserRole, permissions: string[], userId = 'user-1') {
  const result = tenantUser<CurrentUserPayload>({
    userId,
    email: `${userId}@example.com`,
    role,
    organizationId,
  });
  return {
    ...result,
    tenantContext: { ...result.tenantContext!, permissions },
  };
}

const user = actor(UserRole.ADMIN, [
  'task:create', 'task:create-subtask', 'task:update', 'task:assign', 'task:reassign',
]);

function createPrismaService() {
  return {
    task: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    company: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    opportunity: {
      findFirst: jest.fn(),
    },
    person: {
      findFirst: jest.fn(),
    },
    opportunityCommercialDocument: {
      findFirst: jest.fn(),
    },
    opportunityPayment: {
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: user.userId,
        isActive: true,
        role: UserRole.ADMIN,
      }),
    },
    team: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    meeting: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    activity: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    productCatalogItem: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
}

function createService(
  prisma: ReturnType<typeof createPrismaService>,
  companyAccess = {
    assertCompanyReadable: jest.fn().mockImplementation(async (companyId: string) => ({ id: companyId })),
  },
) {
  return new TasksService(
    prisma as any,
    { record: jest.fn() } as any,
    { notifyUser: jest.fn() } as any,
    { publishDomainEvent: jest.fn() } as any,
    companyAccess as any,
  );
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    organizationId,
    title: 'Follow up',
    status: TaskStatus.TODO,
    priority: Priority.MEDIUM,
    companyId: null,
    personId: null,
    opportunityId: null,
    commercialDocumentId: null,
    paymentId: null,
    meetingId: null,
    activityId: null,
    productId: null,
    parentTaskId: null,
    assignmentScope: TaskAssignmentScope.SELF,
    teamId: null,
    assignedToId: user.userId,
    createdById: user.userId,
    dueAt: null,
    reminderAt: null,
    company: null,
    person: null,
    opportunity: null,
    commercialDocument: null,
    payment: null,
    ...overrides,
  };
}

describe('TasksService relation resolution', () => {
  it('lists active companies from the current organization without an accidental owner filter', async () => {
    const prisma = createPrismaService();
    const rep = actor(UserRole.REP, ['task:create']);

    await createService(prisma).findEntityOptions({ type: 'COMPANY' } as any, rep);

    expect(prisma.company.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId, archivedAt: null }] },
    }));
  });

  it('allows a REP to link a readable company in the same organization', async () => {
    const prisma = createPrismaService();
    const rep = actor(UserRole.REP, ['task:create', 'task:assign']);
    const companyAccess = { assertCompanyReadable: jest.fn().mockResolvedValue({ id: 'company-1' }) };
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: true, role: UserRole.REP, teamId: null });
    prisma.task.create.mockResolvedValue(task({ companyId: 'company-1', assignedToId: 'user-2', assignmentScope: TaskAssignmentScope.ORGANIZATION }));

    await expect(createService(prisma, companyAccess).create({
      title: 'Organization follow-up', companyId: 'company-1',
      assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2',
    }, rep)).resolves.toBeDefined();

    expect(companyAccess.assertCompanyReadable).toHaveBeenCalledWith('company-1', rep);
  });

  it('preserves not-found semantics when company access rejects another tenant or an unavailable company', async () => {
    const prisma = createPrismaService();
    const companyAccess = { assertCompanyReadable: jest.fn().mockRejectedValue(new NotFoundException('Company not found')) };
    await expect(createService(prisma, companyAccess).create({
      title: 'Cross-tenant task', companyId: 'company-outside-tenant',
    }, actor(UserRole.REP, ['task:create']))).rejects.toThrow('Company not found');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('keeps the previously successful admin company-link flow working', async () => {
    const prisma = createPrismaService();
    prisma.task.create.mockResolvedValue(task({ companyId: 'company-1' }));
    await expect(createService(prisma).create({
      title: 'Admin follow-up', companyId: 'company-1',
    }, user)).resolves.toBeDefined();
  });

  it('derives companyId from opportunityId during task creation', async () => {
    const prisma = createPrismaService();
    prisma.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity-1',
      companyId: 'company-1',
      archivedAt: null,
    });
    prisma.task.create.mockResolvedValue(task({
      companyId: 'company-1',
      opportunityId: 'opportunity-1',
    }));
    const service = createService(prisma);

    await service.create(
      {
        title: 'Follow up',
        opportunityId: 'opportunity-1',
      },
      user,
    );

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          opportunityId: 'opportunity-1',
        }),
      }),
    );
  });

  it('rejects a task company that conflicts with the selected opportunity company', async () => {
    const prisma = createPrismaService();
    prisma.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity-1',
      companyId: 'company-1',
      archivedAt: null,
    });
    const service = createService(prisma);

    await expect(
      service.create(
        {
          title: 'Follow up',
          companyId: 'company-2',
          opportunityId: 'opportunity-1',
        },
        user,
      ),
    ).rejects.toThrow(
      new BadRequestException('Task company must match the selected opportunity company.'),
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects a person from a different company than the opportunity company', async () => {
    const prisma = createPrismaService();
    prisma.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity-1',
      companyId: 'company-1',
      archivedAt: null,
    });
    prisma.person.findFirst.mockResolvedValue({
      id: 'person-1',
      companyId: 'company-2',
    });
    const service = createService(prisma);

    await expect(
      service.create(
        {
          title: 'Follow up',
          opportunityId: 'opportunity-1',
          personId: 'person-1',
        },
        user,
      ),
    ).rejects.toThrow(
      new BadRequestException('Selected person does not belong to the task company.'),
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('updates companyId from the new opportunity during task update', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task({
      id: 'task-1',
      companyId: 'company-1',
    }));
    prisma.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity-2',
      companyId: 'company-2',
      archivedAt: null,
    });
    prisma.task.update.mockResolvedValue(task({
      id: 'task-1',
      companyId: 'company-2',
      opportunityId: 'opportunity-2',
    }));
    const service = createService(prisma);

    await service.update(
      'task-1',
      {
        opportunityId: 'opportunity-2',
      },
      user,
    );

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          company: { connect: { id: 'company-2' } },
          opportunity: { connect: { id: 'opportunity-2' } },
        }),
      }),
    );
  });
});
describe('TasksService work-management rules', () => {
  it('keeps SELF assignment consistent with the acting user', async () => {
    const prisma = createPrismaService();
    prisma.task.create.mockResolvedValue(task());
    const service = createService(prisma);

    await service.create({ title: 'Self task', assignmentScope: TaskAssignmentScope.SELF }, user);

    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignmentScope: TaskAssignmentScope.SELF, assignedToId: user.userId }),
    }));
  });

  it('rejects a TEAM assignee who is not a member of the selected team', async () => {
    const prisma = createPrismaService();
    prisma.team.findFirst.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000010' });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: true, role: UserRole.MANAGER, teamId: 'other-team' });
    const service = createService(prisma);

    await expect(service.create({
      title: 'Team task', assignmentScope: TaskAssignmentScope.TEAM,
      teamId: '00000000-0000-4000-8000-000000000010', assignedToId: '00000000-0000-4000-8000-000000000020',
    }, user)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TASK_ASSIGNEE_TEAM_MISMATCH' }) });
  });

  it('rejects a linked meeting outside the organization', async () => {
    const prisma = createPrismaService();
    prisma.meeting.findFirst.mockResolvedValue(null);
    const service = createService(prisma);
    await expect(service.create({ title: 'Meeting task', meetingId: '00000000-0000-4000-8000-000000000030' }, user))
      .rejects.toThrow('Meeting not found');
  });

  it('reassigns the same task and records before/after audit metadata', async () => {
    const prisma = createPrismaService();
    const current = task({ assignedToId: user.userId });
    const updated = task({ assignedToId: 'user-2', assignmentScope: TaskAssignmentScope.ORGANIZATION });
    prisma.task.findFirst.mockResolvedValue(current);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: true, role: UserRole.MANAGER, teamId: null });
    prisma.task.update.mockResolvedValue(updated);
    const audit = { record: jest.fn() };
    const notifications = { notifyUser: jest.fn() };
    const core = { publishDomainEvent: jest.fn() };
    const service = new TasksService(prisma as any, audit as any, notifications as any, core as any, { assertCompanyReadable: jest.fn() } as any);

    await service.reassign('task-1', { assignmentScope: TaskAssignmentScope.ORGANIZATION, assigneeId: 'user-2', reason: 'Capacity' }, user);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.reassigned', before: expect.objectContaining({ assignedToId: user.userId }), after: expect.objectContaining({ assignedToId: 'user-2' }), metadata: { reason: 'Capacity' } }));
    expect(notifications.notifyUser).not.toHaveBeenCalled();
    expect(core.publishDomainEvent).toHaveBeenCalledTimes(1);
    expect(core.publishDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'TASK.REASSIGNED', aggregateId: 'task-1' }));
  });

  it('creates a linked child without changing the parent assignment', async () => {
    const prisma = createPrismaService();
    const parent = task({ opportunityId: 'opportunity-1' });
    const child = task({ id: 'task-2', parentTaskId: 'task-1', opportunityId: 'opportunity-1' });
    prisma.task.findFirst.mockResolvedValue(parent);
    prisma.task.create.mockResolvedValue(child);
    const service = createService(prisma);

    await service.createSubtask('task-1', { title: 'Child', inheritLinkedEntity: true }, user);

    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ parentTaskId: 'task-1', opportunityId: 'opportunity-1' }) }));
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('enforces the maximum hierarchy depth of three', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst
      .mockResolvedValueOnce(task({ id: 'task-3', parentTaskId: 'task-2' }))
      .mockResolvedValueOnce({ parentTaskId: 'task-1' })
      .mockResolvedValueOnce({ parentTaskId: null });
    const service = createService(prisma);
    await expect(service.createSubtask('task-3', { title: 'Too deep', inheritLinkedEntity: true }, user))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TASK_MAX_DEPTH_EXCEEDED' }) });
  });

  it('blocks parent completion while an incomplete subtask remains', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    prisma.task.count.mockResolvedValue(2);
    const service = createService(prisma);
    await expect(service.complete('task-1', {}, user))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TASK_INCOMPLETE_SUBTASKS', details: { incompleteSubtaskCount: 2 } }) });
  });

  it('allows parent completion after every subtask is resolved', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    prisma.task.count.mockResolvedValue(0);
    prisma.task.update.mockResolvedValue(task({ status: TaskStatus.DONE, completedAt: new Date() }));
    const service = createService(prisma);
    await expect(service.complete('task-1', { completionNote: 'Done' }, user)).resolves.toMatchObject({ status: TaskStatus.DONE });
  });
});

describe('TasksService permission-driven assignment', () => {
  const selfOnly = actor(UserRole.REP, ['task:create']);
  const repDispatcher = actor(UserRole.REP, ['task:view', 'task:create', 'task:assign']);

  function prepareCreate(prisma: ReturnType<typeof createPrismaService>, assignedToId = 'user-2') {
    prisma.user.findFirst.mockResolvedValue({
      id: assignedToId,
      isActive: true,
      role: UserRole.REP,
      teamId: null,
    });
    prisma.task.create.mockResolvedValue(task({
      assignedToId,
      assignmentScope: TaskAssignmentScope.ORGANIZATION,
    }));
  }

  it('allows a REP with task:create to create a SELF task', async () => {
    const prisma = createPrismaService();
    prisma.task.create.mockResolvedValue(task());
    await expect(createService(prisma).create({ title: 'Self', assignmentScope: TaskAssignmentScope.SELF }, selfOnly)).resolves.toBeDefined();
  });

  it('denies a REP without task:assign from assigning another user', async () => {
    const prisma = createPrismaService();
    await expect(createService(prisma).create({ title: 'Other', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, selfOnly))
      .rejects.toMatchObject({ response: { code: 'TASK_ASSIGN_PERMISSION_REQUIRED' } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('allows a REP with task:create and task:assign to assign another user', async () => {
    const prisma = createPrismaService();
    prepareCreate(prisma);
    await expect(createService(prisma).create({ title: 'Other', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, repDispatcher)).resolves.toBeDefined();
  });

  it('allows the mandatory custom-role case with baseRole REP and task:assign', async () => {
    const prisma = createPrismaService();
    prepareCreate(prisma);
    const customRoleUser = { ...repDispatcher, roleId: 'custom-dispatcher-role' };
    await expect(createService(prisma).create({ title: 'Custom role assignment', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, customRoleUser)).resolves.toBeDefined();
  });

  it.each([UserRole.MANAGER, UserRole.ADMIN])('denies %s without effective task:assign', async (role) => {
    const prisma = createPrismaService();
    const actingUser = actor(role, ['task:create']);
    await expect(createService(prisma).create({ title: 'Denied', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, actingUser))
      .rejects.toMatchObject({ response: { code: 'TASK_ASSIGN_PERMISSION_REQUIRED' } });
  });

  it('allows a MANAGER with task:assign', async () => {
    const prisma = createPrismaService();
    prepareCreate(prisma);
    await expect(createService(prisma).create({ title: 'Allowed', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, actor(UserRole.MANAGER, ['task:create', 'task:assign']))).resolves.toBeDefined();
  });

  it('rejects a cross-organization assignee after permission succeeds', async () => {
    const prisma = createPrismaService();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(createService(prisma).create({ title: 'Cross tenant', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, repDispatcher))
      .rejects.toThrow('Task assignee must be an active internal user');
  });

  it('rejects an inactive assignee', async () => {
    const prisma = createPrismaService();
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: false, role: UserRole.REP });
    await expect(createService(prisma).create({ title: 'Inactive', assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, repDispatcher))
      .rejects.toThrow('Task assignee must be an active internal user');
  });

  it('denies TEAM assignment without task:assign before resolving the team', async () => {
    const prisma = createPrismaService();
    await expect(createService(prisma).create({ title: 'Team', assignmentScope: TaskAssignmentScope.TEAM, teamId: 'team-1' }, selfOnly))
      .rejects.toMatchObject({ response: { code: 'TASK_ASSIGN_PERMISSION_REQUIRED' } });
    expect(prisma.team.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a TEAM assignee outside the selected active team', async () => {
    const prisma = createPrismaService();
    prisma.team.findFirst.mockResolvedValue({ id: 'team-1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: true, role: UserRole.REP, teamId: 'team-2' });
    await expect(createService(prisma).create({ title: 'Mismatch', assignmentScope: TaskAssignmentScope.TEAM, teamId: 'team-1', assignedToId: 'user-2' }, repDispatcher))
      .rejects.toMatchObject({ response: { code: 'TASK_ASSIGNEE_TEAM_MISMATCH' } });
  });

  it('denies ORGANIZATION assignment without task:assign', async () => {
    const prisma = createPrismaService();
    await expect(createService(prisma).create({ title: 'Organization', assignmentScope: TaskAssignmentScope.ORGANIZATION }, selfOnly))
      .rejects.toMatchObject({ response: { code: 'TASK_ASSIGN_PERMISSION_REQUIRED' } });
  });

  it('allows reassign with task:reassign and keeps the audit action', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: true, role: UserRole.REP, teamId: null });
    prisma.task.update.mockResolvedValue(task({ assignedToId: 'user-2', assignmentScope: TaskAssignmentScope.ORGANIZATION }));
    const audit = { record: jest.fn() };
    const service = new TasksService(prisma as any, audit as any, { notifyUser: jest.fn() } as any, { publishDomainEvent: jest.fn() } as any, { assertCompanyReadable: jest.fn() } as any);
    await service.reassign('task-1', { assignmentScope: TaskAssignmentScope.ORGANIZATION, assigneeId: 'user-2' }, actor(UserRole.REP, ['task:reassign']));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.reassigned' }));
  });

  it('denies reassign without task:reassign or compatibility task:assign', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    await expect(createService(prisma).reassign('task-1', { assignmentScope: TaskAssignmentScope.SELF }, selfOnly))
      .rejects.toMatchObject({ response: { code: 'TASK_REASSIGN_PERMISSION_REQUIRED' } });
  });

  it('preserves task:assign as the documented reassign compatibility fallback', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    prisma.task.update.mockResolvedValue(task());
    await expect(createService(prisma).reassign('task-1', { assignmentScope: TaskAssignmentScope.SELF }, actor(UserRole.REP, ['task:assign']))).resolves.toBeDefined();
  });

  it('prevents generic PATCH assignment changes with task:update alone', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    await expect(createService(prisma).update('task-1', { assignmentScope: TaskAssignmentScope.ORGANIZATION, assignedToId: 'user-2' }, actor(UserRole.MANAGER, ['task:update'])))
      .rejects.toMatchObject({ response: { code: 'TASK_REASSIGN_PERMISSION_REQUIRED' } });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('allows a self-assigned subtask with task:create-subtask', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    prisma.task.create.mockResolvedValue(task({ id: 'task-2', parentTaskId: 'task-1' }));
    await expect(createService(prisma).createSubtask('task-1', { title: 'Self child', assignmentScope: TaskAssignmentScope.SELF, inheritLinkedEntity: true }, actor(UserRole.REP, ['task:create-subtask']))).resolves.toBeDefined();
  });

  it('denies assigning a subtask to another user without task:assign', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    await expect(createService(prisma).createSubtask('task-1', { title: 'Other child', assignmentScope: TaskAssignmentScope.ORGANIZATION, assigneeId: 'user-2', inheritLinkedEntity: true }, actor(UserRole.REP, ['task:create-subtask'])))
      .rejects.toMatchObject({ response: { code: 'TASK_ASSIGN_PERMISSION_REQUIRED' } });
  });

  it('allows assigning a subtask to another user with task:assign', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', isActive: true, role: UserRole.REP, teamId: null });
    prisma.task.create.mockResolvedValue(task({ id: 'task-2', parentTaskId: 'task-1', assignedToId: 'user-2' }));
    await expect(createService(prisma).createSubtask('task-1', { title: 'Other child', assignmentScope: TaskAssignmentScope.ORGANIZATION, assigneeId: 'user-2', inheritLinkedEntity: true }, actor(UserRole.REP, ['task:create-subtask', 'task:assign']))).resolves.toBeDefined();
  });

  it('requires task:assign on the dedicated assign operation even for self', async () => {
    const prisma = createPrismaService();
    prisma.task.findFirst.mockResolvedValue(task());
    await expect(createService(prisma).assign('task-1', { assignedToId: selfOnly.userId }, selfOnly))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
