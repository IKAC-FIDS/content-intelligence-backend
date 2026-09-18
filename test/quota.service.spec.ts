import {
  QuotaMetric,
  QuotaResetPeriod,
  UsageReservationStatus,
} from '@prisma/client';
import { QuotaExceededException } from '../src/quota/quota-exceeded.exception';
import { QuotaService } from '../src/quota/quota.service';

const effective = {
  organizationId: 'org-a',
  metric: QuotaMetric.API_CALLS,
  state: 'ENFORCED',
  enabled: true,
  unlimited: false,
  softLimit: 8n,
  hardLimit: 10n,
  resetPeriod: QuotaResetPeriod.MONTHLY,
  periodStart: new Date('2026-08-01'),
  periodEnd: new Date('2026-09-01'),
  planCode: 'BUSINESS',
  subscriptionId: 'sub-a',
  entitlementVersion: 2,
} as const;
function setup(currentValue = 0n, reserved = 0n) {
  const counter = {
    id: 'counter-a',
    organizationId: 'org-a',
    metric: QuotaMetric.API_CALLS,
    periodStart: effective.periodStart,
    currentValue,
    effectiveHardLimit: 10n,
  };
  const tx: any = {
    $queryRaw: jest.fn(),
    usageReservation: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: reserved } }),
      create: jest.fn().mockResolvedValue({ id: 'reservation-a' }),
      update: jest.fn(),
    },
    usageCounter: {
      upsert: jest.fn().mockResolvedValue(counter),
      update: jest.fn(),
    },
    quotaThresholdEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn() },
    organizationMembership: { count: jest.fn().mockResolvedValue(0) },
    company: { count: jest.fn().mockResolvedValue(0) },
    opportunity: { count: jest.fn().mockResolvedValue(0) },
    fileAttachment: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(tx)),
    auditLog: { create: jest.fn() },
    usageReservation: { updateMany: jest.fn() },
    usageCounter: { findUnique: jest.fn() },
    usageEvent: { findUnique: jest.fn() },
  };
  const resolver: any = {
    resolve: jest
      .fn()
      .mockImplementation((organizationId: string, metric: QuotaMetric) =>
        Promise.resolve({ ...effective, organizationId, metric }),
      ),
  };
  return { prisma, resolver, tx, service: new QuotaService(prisma, resolver) };
}
describe('QuotaService fix 000093 enforcement', () => {
  it('returns metrics and generatedAt using the authoritative runtime shape', async () => {
    const { service, prisma } = setup();
    prisma.usageCounter.findUnique.mockResolvedValue({ currentValue: 8n });
    const generatedAt = new Date('2026-08-14T08:30:00.000Z');

    const result = await service.summaryForTenant(
      { organizationId: 'org-a' } as any,
      generatedAt,
    );

    expect(result).toMatchObject({
      organizationId: 'org-a',
      generatedAt: generatedAt.toISOString(),
      metrics: expect.any(Array),
    });
    expect(result).not.toHaveProperty('quotas');
    expect(result.metrics[0]).toEqual(
      expect.objectContaining({
        current: '8', softLimit: '8', hardLimit: '10',
        resetPeriod: QuotaResetPeriod.MONTHLY,
        resetAt: '2026-09-01T00:00:00.000Z', threshold: 80,
      }),
    );
  });
  it('allows exactly the hard limit and takes the tenant+metric advisory lock', async () => {
    const { service, tx } = setup(9n);
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'request-a'),
    ).resolves.toMatchObject({ status: 'RESERVED' });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.usageReservation.create).toHaveBeenCalled();
  });
  it('rejects one unit above hard limit with a stable reason and violation audit', async () => {
    const { service, prisma } = setup(10n);
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'request-a'),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-a',
          action: 'quota.hard-limit-exceeded',
        }),
      }),
    );
  });
  it('counts existing reservations so concurrent requests cannot both pass', async () => {
    const { service } = setup(9n, 1n);
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'request-b'),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });
  it('supports zero hard limit', async () => {
    const { service, resolver } = setup();
    resolver.resolve.mockResolvedValue({ ...effective, hardLimit: 0n });
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'request-a'),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });
  it.each([
    { enabled: false, unlimited: false, state: 'DISABLED' },
    { enabled: true, unlimited: true, state: 'UNLIMITED' },
    { enabled: false, unlimited: true, state: 'LEGACY_COMPATIBILITY' },
  ])('meters without blocking $state', async (mode) => {
    const { service, resolver, tx } = setup(999n);
    resolver.resolve.mockResolvedValue({ ...effective, ...mode });
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'request-a'),
    ).resolves.toMatchObject({ status: 'RESERVED' });
    expect(tx.usageReservation.create).toHaveBeenCalled();
  });
  it('returns the same reservation for an idempotency retry', async () => {
    const { service, tx } = setup();
    tx.usageReservation.findUnique.mockResolvedValue({
      id: 'existing',
      amount: 1n,
      status: UsageReservationStatus.RESERVED,
    });
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'same'),
    ).resolves.toMatchObject({
      reservationId: 'existing',
      status: 'ALREADY_RESERVED',
    });
    expect(tx.usageReservation.create).not.toHaveBeenCalled();
  });
  it('reactivates a released reservation safely on retry', async () => {
    const { service, tx } = setup();
    tx.usageReservation.findUnique.mockResolvedValue({
      id: 'existing',
      amount: 1n,
      status: UsageReservationStatus.RELEASED,
    });
    tx.usageReservation.update.mockResolvedValue({ id: 'existing' });
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'same'),
    ).resolves.toMatchObject({ reservationId: 'existing', status: 'RESERVED' });
    expect(tx.usageReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: UsageReservationStatus.RESERVED,
        }),
      }),
    );
  });
  it('expires stale reservations before projecting usage', async () => {
    const { service, tx } = setup();
    await service.reserve('org-a', QuotaMetric.API_CALLS, 1n, 'request-a');
    expect(tx.usageReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: UsageReservationStatus.RESERVED,
          expiresAt: expect.any(Object),
        }),
      }),
    );
  });
  it('rejects non-positive usage', async () => {
    const { service } = setup();
    await expect(
      service.reserve('org-a', QuotaMetric.API_CALLS, 0n, 'bad'),
    ).rejects.toThrow('positive');
  });
  it('commits once and emits 80/90 threshold events idempotently', async () => {
    const { service, tx } = setup();
    const row = {
      id: 'reservation-a',
      organizationId: 'org-a',
      counterId: 'counter-a',
      metric: QuotaMetric.API_CALLS,
      status: UsageReservationStatus.RESERVED,
      amount: 1n,
    };
    tx.usageReservation.findMany.mockResolvedValue([row]);
    tx.usageReservation.findUnique.mockResolvedValue(row);
    tx.usageCounter.update.mockResolvedValue({
      id: 'counter-a',
      organizationId: 'org-a',
      metric: QuotaMetric.API_CALLS,
      periodStart: effective.periodStart,
      currentValue: 9n,
      effectiveHardLimit: 10n,
    });
    await service.commitReservation('reservation-a');
    expect(tx.quotaThresholdEvent.createMany).toHaveBeenCalledTimes(2);
    expect(tx.usageReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: UsageReservationStatus.COMMITTED,
        }),
      }),
    );
  });
  it.each([
    [7n, 0],
    [8n, 1],
    [9n, 2],
  ])('emits deterministic thresholds at usage %s', async (usage, events) => {
    const { service, tx } = setup();
    const row = {
      id: 'reservation-a',
      organizationId: 'org-a',
      counterId: 'counter-a',
      metric: QuotaMetric.API_CALLS,
      status: UsageReservationStatus.RESERVED,
      amount: 1n,
    };
    tx.usageReservation.findMany.mockResolvedValue([row]);
    tx.usageReservation.findUnique.mockResolvedValue(row);
    tx.usageCounter.update.mockResolvedValue({
      id: 'counter-a',
      organizationId: 'org-a',
      metric: QuotaMetric.API_CALLS,
      periodStart: effective.periodStart,
      currentValue: usage,
      effectiveHardLimit: 10n,
    });
    await service.commitReservation('reservation-a');
    expect(tx.quotaThresholdEvent.createMany).toHaveBeenCalledTimes(
      events as number,
    );
  });
  it('release is state-conditional and idempotent', async () => {
    const { service, prisma } = setup();
    prisma.usageReservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.releaseReservation('reservation-a')).resolves.toEqual({
      released: false,
    });
    expect(prisma.usageReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reservation-a', status: UsageReservationStatus.RESERVED },
      }),
    );
  });
  it('keeps counter operations tenant-scoped', async () => {
    const { service, tx } = setup();
    await service.reserve('tenant-a', QuotaMetric.API_CALLS, 1n, 'request-a');
    expect(tx.usageCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_metric_periodStart: expect.objectContaining({
            organizationId: 'tenant-a',
          }),
        },
      }),
    );
  });
});
