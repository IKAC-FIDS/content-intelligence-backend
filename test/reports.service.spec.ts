import { UserRole } from '@prisma/client';
import { ActivityType } from '../src/activities/activity-type';
import { ReportsService } from '../src/reports/reports.service';
import { tenantUser } from './helpers/tenant-user';

function createPrismaService() {
  return {
    activity: {
      groupBy: jest.fn().mockResolvedValue([
        {
          type: ActivityType.CALL,
          _count: { id: 2 },
        },
      ]),
    },
  };
}

describe('ReportsService date filters', () => {
  it('returns the selected date-only end date while querying with an exclusive next-day bound', async () => {
    const prisma = createPrismaService();
    const service = new ReportsService(prisma as any);

    const result = await service.getActivityReport(
      {
        startDate: '2026-07-01',
        endDate: '2026-07-12',
      },
      tenantUser({
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        organizationId: '00000000-0000-4000-8000-000000000001',
      }),
    );

    expect(result.startDate?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result.endDate?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(prisma.activity.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              occurredAt: {
                gte: new Date('2026-07-01T00:00:00.000Z'),
                lt: new Date('2026-07-13T00:00:00.000Z'),
              },
            },
          ]),
        }),
      }),
    );
  });
});
