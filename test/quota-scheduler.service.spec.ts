import { QuotaMetric, UsageReservationStatus } from '@prisma/client';
import { QuotaSchedulerService } from '../src/quota/quota-scheduler.service';
describe('QuotaSchedulerService fix 000093', () => {
  it('expires stale reservations and creates immutable closed-period snapshots once', async () => {
    const counter: any = {
      id: 'c1',
      organizationId: 'org-a',
      metric: QuotaMetric.API_CALLS,
      periodStart: new Date('2026-07-01'),
      periodEnd: new Date('2026-08-01'),
      currentValue: 90n,
      effectiveSoftLimit: 80n,
      effectiveHardLimit: 100n,
    };
    const prisma: any = {
      usageReservation: { updateMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      usageCounter: { findMany: jest.fn().mockResolvedValue([counter]) },
      usageSnapshot: {
        createMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new QuotaSchedulerService(prisma);
    expect(await service.finalizeClosedPeriods(new Date('2026-08-13'))).toEqual(
      { created: 1 },
    );
    expect(await service.finalizeClosedPeriods(new Date('2026-08-13'))).toEqual(
      { created: 0 },
    );
    expect(prisma.usageReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: UsageReservationStatus.RESERVED,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('uses bounded NOT EXISTS selection so delayed scheduler does not overwrite history', async () => {
    const prisma: any = {
      usageReservation: { updateMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      usageCounter: { findMany: jest.fn() },
      usageSnapshot: { createMany: jest.fn() },
    };
    await new QuotaSchedulerService(prisma).finalizeClosedPeriods();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.usageCounter.findMany).not.toHaveBeenCalled();
  });
});
