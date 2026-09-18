import { UserRole } from '@prisma/client';
import type { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';
import { ReportsService } from '../src/reports/reports.service';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
const selectedUserId = '00000000-0000-4000-8000-000000000002';

function actor(permissions: string[] = []) {
  const value = tenantUser<CurrentUserPayload>({
    userId: '00000000-0000-4000-8000-000000000003',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    organizationId,
  });
  return {
    ...value,
    tenantContext: { ...value.tenantContext!, permissions },
  };
}

function prismaMock() {
  return {
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: selectedUserId, fullName: 'کاربر نمونه', email: 'user@example.com', teamId: null, teamRef: null },
      ]),
    },
    lookupOption: {
      findMany: jest.fn().mockResolvedValue([
        { code: 'CALL', label: 'تماس تلفنی', sortOrder: 1 },
        { code: 'DEMO', label: 'دمو', sortOrder: 2 },
      ]),
    },
    activity: {
      groupBy: jest.fn().mockResolvedValue([
        { userId: selectedUserId, type: 'CALL', _count: { id: 3 } },
        { userId: selectedUserId, type: 'STAGE_CHANGE', _count: { id: 67 } },
      ]),
    },
    auditLog: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ actorId: selectedUserId, entityId: 'company-1' }])
        .mockResolvedValueOnce([
          { actorId: selectedUserId, entityId: 'opportunity-1' },
          { actorId: selectedUserId, entityId: 'opportunity-2' },
        ]),
    },
    task: {
      groupBy: jest.fn()
        .mockResolvedValueOnce([{ createdById: selectedUserId, _count: { id: 4 } }])
        .mockResolvedValueOnce([
          { assignedToId: selectedUserId, status: 'DONE', _count: { id: 2 } },
          { assignedToId: selectedUserId, status: 'TODO', _count: { id: 3 } },
        ]),
    },
    meeting: {
      groupBy: jest.fn().mockResolvedValue([
        { organizerId: selectedUserId, _count: { id: 2 } },
      ]),
    },
    opportunity: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'opportunity-1', estimatedValue: 100, stage: { isTerminal: false, terminalType: null } },
        { id: 'opportunity-2', estimatedValue: 250, stage: { isTerminal: true, terminalType: 'WON' } },
      ]),
    },
  };
}

describe('ReportsService user performance', () => {
  it('aggregates the selected user and includes zero-count active activity types', async () => {
    const prisma = prismaMock();
    const result = await new ReportsService(prisma as any).getUserPerformance(
      {
        userIds: [selectedUserId],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      },
      actor(['financial:view']) as any,
    );

    expect(result.activity).toEqual({
      total: 3,
      breakdown: [
        { code: 'CALL', label: 'تماس تلفنی', count: 3 },
        { code: 'DEMO', label: 'دمو', count: 0 },
      ],
      uncataloguedCount: 0,
    });
    expect(result.companiesCreated).toBe(1);
    expect(result.meetings).toBe(2);
    expect(result.members[0].meetings).toBe(2);
    expect(result.tasksCreated).toBe(4);
    expect(result.tasksAssigned).toEqual({ total: 5, completed: 2, incomplete: 3 });
    expect(result.members[0].activity.breakdown[0]).toEqual({
      code: 'CALL', label: 'تماس تلفنی', count: 3, percentage: 100,
    });
    expect(result.opportunities).toEqual({
      total: 2,
      active: 1,
      won: 1,
      lost: 0,
      totalValue: 350,
      activeValue: 100,
      wonValue: 250,
      lostValue: 0,
    });
    expect(prisma.activity.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: [selectedUserId] },
          type: { not: 'STAGE_CHANGE' },
          occurredAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lt: new Date('2026-10-01T00:00:00.000Z'),
          },
        }),
      }),
    );
    expect(prisma.meeting.groupBy).toHaveBeenCalledWith({
      by: ['organizerId'],
      where: {
        organizationId,
        organizerId: { in: [selectedUserId] },
        startAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lt: new Date('2026-10-01T00:00:00.000Z'),
        },
      },
      _count: { id: true },
    });
  });

  it('redacts opportunity values without financial permission', async () => {
    const result = await new ReportsService(prismaMock() as any).getUserPerformance(
      { userIds: [selectedUserId] },
      actor() as any,
    );

    expect(result.financialVisible).toBe(false);
    expect(result.opportunities.totalValue).toBeNull();
    expect(result.opportunities.activeValue).toBeNull();
    expect(result.opportunities.wonValue).toBeNull();
    expect(result.opportunities.lostValue).toBeNull();
  });
});
