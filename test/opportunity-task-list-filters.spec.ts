import { TaskStatus, UserRole } from '@prisma/client';
import { OpportunitiesService } from '../src/opportunities/opportunities.service';
import { TasksService } from '../src/tasks/tasks.service';
import { tenantUser } from './helpers/tenant-user';
import { quotaMock } from './helpers/quota';

const organizationId = '00000000-0000-4000-8000-000000000001';
const user = tenantUser({
  userId: 'user-1',
  email: 'a@example.com',
  role: UserRole.ADMIN,
  organizationId,
});

describe('activeOnly opportunity filtering', () => {
  function setup() {
    const prisma = {
      opportunity: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    return {
      prisma,
      service: new OpportunitiesService(
        prisma as any,
        {} as any,
        {} as any,
        quotaMock() as any,
        {} as any,
      ),
    };
  }
  it('requires a non-archived, non-terminal stage while retaining organization and owner filters', async () => {
    const { prisma, service } = setup();
    await service.findAll(
      { activeOnly: 'true', ownerId: '00000000-0000-4000-8000-000000000002' },
      user as any,
    );
    const where = prisma.opportunity.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { organizationId },
        { ownerId: '00000000-0000-4000-8000-000000000002' },
        {
          archivedAt: null,
          company: { archivedAt: null },
          stage: { isTerminal: false },
        },
      ]),
    );
  });
  it('rejects activeOnly with archivedOnly', async () => {
    const { service } = setup();
    await expect(
      service.findAll(
        { activeOnly: 'true', archivedOnly: 'true' },
        user as any,
      ),
    ).rejects.toThrow('activeOnly=true cannot be combined');
  });
  it('preserves prior archive behavior when activeOnly is omitted', async () => {
    const { prisma, service } = setup();
    await service.findAll({}, user as any);
    expect(
      prisma.opportunity.findMany.mock.calls[0][0].where.AND,
    ).toContainEqual({ archivedAt: null });
  });
  it('returns the same three-opportunity active population used by report reconciliation fixtures', async () => {
    const prisma = {
      opportunity: {
        findMany: jest.fn().mockResolvedValue([{}, {}, {}]),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const service = new OpportunitiesService(
      prisma as any,
      {} as any,
      {} as any,
      quotaMock() as any,
      {} as any,
    );
    const result = await service.findAll(
      { activeOnly: 'true', page: 1, limit: 20 },
      user as any,
    );
    expect(result.meta.total).toBe(3);
    expect(result.data).toHaveLength(3);
    expect(prisma.opportunity.count.mock.calls[0][0].where).toEqual(
      prisma.opportunity.findMany.mock.calls[0][0].where,
    );
  });
});

describe('overdueOnly task filtering', () => {
  function setup(total = 0) {
    const prisma = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(total),
      },
    };
    return {
      prisma,
      service: new TasksService(prisma as any, {} as any, {} as any, { publishDomainEvent: jest.fn() } as any, { assertCompanyReadable: jest.fn() } as any),
    };
  }
  it('uses a database predicate for open tasks and exact count pagination', async () => {
    const { prisma, service } = setup(37);
    const result = await service.findAll(
      {
        overdueOnly: 'true',
        limit: 1,
        assignedToId: '00000000-0000-4000-8000-000000000002',
      },
      user as any,
    );
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { organizationId },
        { assignedToId: '00000000-0000-4000-8000-000000000002' },
        {
          dueAt: { not: null, lt: expect.any(Date) },
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        },
      ]),
    );
    expect(prisma.task.count).toHaveBeenCalledWith({ where });
    expect(result.meta.total).toBe(37);
  });
  it('combines overdueOnly with an open explicit status', async () => {
    const { prisma, service } = setup();
    await service.findAll(
      { overdueOnly: 'true', status: TaskStatus.TODO },
      user as any,
    );
    expect(prisma.task.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        { status: TaskStatus.TODO },
        { dueAt: { not: null, lt: expect.any(Date) } },
      ]),
    );
  });
  it('rejects terminal status with overdueOnly', async () => {
    const { service } = setup();
    await expect(
      service.findAll(
        { overdueOnly: 'true', status: TaskStatus.DONE },
        user as any,
      ),
    ).rejects.toThrow('overdueOnly=true is only compatible');
  });
});
