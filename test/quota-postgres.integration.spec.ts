import {
  PrismaClient,
  QuotaMetric,
  QuotaResetPeriod,
  SubscriptionStatus,
  SubscriptionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { QuotaResolverService } from '../src/quota/quota-resolver.service';
import { QuotaSchedulerService } from '../src/quota/quota-scheduler.service';
import { QuotaService } from '../src/quota/quota.service';

const describeDb =
  process.env.RUN_QUOTA_DB_TESTS === '1' ? describe : describe.skip;
describeDb('Quota PostgreSQL concurrency and idempotency fix 000093', () => {
  const prisma = new PrismaClient();
  let organizationId: string;
  let otherOrganizationId: string;
  let service: QuotaService;
  beforeAll(async () => {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        code: `QUOTA-${suffix}`,
        name: 'Quota integration',
        quotas: {
          create: Object.values(QuotaMetric).map((metric) => ({
            metric,
            enabled: true,
            isUnlimited: false,
            hardLimit:
              metric === QuotaMetric.COMPANIES
                ? 1n
                : metric === QuotaMetric.STORAGE_BYTES
                  ? 10n
                  : 100n,
            softLimit: null,
            resetPeriod: QuotaResetPeriod.MONTHLY,
          })),
        },
      },
    });
    const first = await prisma.organization.create({
      data: { code: `quota-a-${suffix}`, name: 'Quota A' },
    });
    const second = await prisma.organization.create({
      data: { code: `quota-b-${suffix}`, name: 'Quota B' },
    });
    organizationId = first.id;
    otherOrganizationId = second.id;
    await prisma.subscription.createMany({
      data: [first.id, second.id].map((id) => ({
        organizationId: id,
        planId: plan.id,
        type: SubscriptionType.STANDARD,
        status: SubscriptionStatus.ACTIVE,
        startAt: new Date('2026-01-01'),
      })),
    });
    service = new QuotaService(
      prisma as never,
      new QuotaResolverService(prisma as never),
    );
  });
  afterAll(() => prisma.$disconnect());
  it('serializes two creates at hardLimit-1 so only one reservation passes', async () => {
    const results = await Promise.allSettled([
      service.reserve(organizationId, QuotaMetric.COMPANIES, 1n, 'company-a'),
      service.reserve(organizationId, QuotaMetric.COMPANIES, 1n, 'company-b'),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    const winner = results.find(
      (row): row is PromiseFulfilledResult<any> => row.status === 'fulfilled',
    )!;
    await service.commitReservation(winner.value.reservationId);
  });
  it('serializes concurrent uploads near the storage hard limit', async () => {
    const results = await Promise.allSettled([
      service.reserve(
        organizationId,
        QuotaMetric.STORAGE_BYTES,
        6n,
        'upload-a',
      ),
      service.reserve(
        organizationId,
        QuotaMetric.STORAGE_BYTES,
        6n,
        'upload-b',
      ),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  });
  it('keeps the same metric independent across tenants', async () => {
    await expect(
      service.reserve(
        otherOrganizationId,
        QuotaMetric.COMPANIES,
        1n,
        'company-a',
      ),
    ).resolves.toMatchObject({ status: 'RESERVED' });
    const own = await prisma.usageCounter.findMany({
      where: { organizationId: otherOrganizationId },
    });
    expect(own.every((row) => row.organizationId === otherOrganizationId)).toBe(
      true,
    );
  });
  it.each([
    QuotaMetric.WORKFLOW_RUNS,
    QuotaMetric.WEBHOOK_DELIVERIES,
    QuotaMetric.EMAIL_SENDS,
    QuotaMetric.AI_REQUESTS,
  ])('deduplicates concurrent retries for %s', async (metric) => {
    const key = `logical-${metric}`;
    await Promise.all([
      service.consumeEvent(organizationId, metric, 1n, key),
      service.consumeEvent(organizationId, metric, 1n, key),
    ]);
    expect(
      await prisma.usageEvent.count({
        where: { organizationId, metric, idempotencyKey: key },
      }),
    ).toBe(1);
    const counter = await prisma.usageCounter.findFirstOrThrow({
      where: { organizationId, metric },
    });
    expect(counter.currentValue).toBe(1n);
  });
  it('increments concurrent API calls and emits each threshold once', async () => {
    await Promise.all([
      service.consumeEvent(organizationId, QuotaMetric.API_CALLS, 50n, 'api-a'),
      service.consumeEvent(organizationId, QuotaMetric.API_CALLS, 50n, 'api-b'),
    ]);
    const counter = await prisma.usageCounter.findFirstOrThrow({
      where: { organizationId, metric: QuotaMetric.API_CALLS },
    });
    expect(counter.currentValue).toBe(100n);
    expect(
      await prisma.quotaThresholdEvent.count({
        where: { organizationId, metric: QuotaMetric.API_CALLS },
      }),
    ).toBe(2);
  });
  it('rolls periods in UTC without scheduler and snapshots each closed period once', async () => {
    await service.consumeEvent(
      otherOrganizationId,
      QuotaMetric.EMAIL_SENDS,
      1n,
      'august',
      new Date('2026-08-31T23:59:59Z'),
    );
    await service.consumeEvent(
      otherOrganizationId,
      QuotaMetric.EMAIL_SENDS,
      1n,
      'september',
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(
      await prisma.usageCounter.count({
        where: {
          organizationId: otherOrganizationId,
          metric: QuotaMetric.EMAIL_SENDS,
        },
      }),
    ).toBe(2);
    const scheduler = new QuotaSchedulerService(prisma as never);
    await scheduler.finalizeClosedPeriods(new Date('2026-10-01T00:00:00Z'));
    const before = await prisma.usageSnapshot.count({
      where: {
        organizationId: otherOrganizationId,
        metric: QuotaMetric.EMAIL_SENDS,
      },
    });
    await scheduler.finalizeClosedPeriods(new Date('2026-10-01T00:00:00Z'));
    expect(
      await prisma.usageSnapshot.count({
        where: {
          organizationId: otherOrganizationId,
          metric: QuotaMetric.EMAIL_SENDS,
        },
      }),
    ).toBe(before);
  });
});
