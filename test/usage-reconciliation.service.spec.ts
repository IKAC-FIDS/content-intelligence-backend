import { QuotaMetric, QuotaResetPeriod } from '@prisma/client';
import { UsageReconciliationService } from '../src/quota/usage-reconciliation.service';
describe('UsageReconciliationService fix 000093', () => {
  function setup() {
    const tx: any = {
      $queryRaw: jest.fn(),
      usageCounter: { upsert: jest.fn().mockResolvedValue({ id: 'c' }) },
      auditLog: { create: jest.fn() },
    };
    const prisma: any = {
      organizationMembership: { count: jest.fn().mockResolvedValue(2) },
      company: { count: jest.fn().mockResolvedValue(3) },
      opportunity: { count: jest.fn().mockResolvedValue(4) },
      fileAttachment: {
        count: jest.fn().mockResolvedValue(5),
        aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 100 } }),
      },
      usageCounter: {
        findUnique: jest.fn().mockResolvedValue({ currentValue: 1n }),
      },
      $transaction: (callback: any) => callback(tx),
    };
    const resolver: any = {
      resolve: jest
        .fn()
        .mockImplementation((organizationId: string, metric: QuotaMetric) => ({
          organizationId,
          metric,
          state: 'LEGACY_COMPATIBILITY',
          softLimit: null,
          hardLimit: null,
          resetPeriod: QuotaResetPeriod.NONE,
          periodStart: new Date(0),
          periodEnd: null,
        })),
    };
    return {
      prisma,
      tx,
      service: new UsageReconciliationService(prisma, resolver),
    };
  }
  it('uses tenant-scoped authoritative definitions and excludes deleted/archived records', async () => {
    const { service, prisma } = setup();
    expect(await service.authoritative('org-a', QuotaMetric.ACTIVE_USERS)).toBe(
      2n,
    );
    expect(
      await service.authoritative('org-a', QuotaMetric.OPPORTUNITIES),
    ).toBe(4n);
    expect(
      await service.authoritative('org-a', QuotaMetric.STORAGE_BYTES),
    ).toBe(100n);
    expect(prisma.opportunity.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-a',
        archivedAt: null,
        company: { archivedAt: null },
      },
    });
    expect(prisma.fileAttachment.aggregate).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', deletedAt: null },
      _sum: { sizeBytes: true },
    });
  });
  it('dry-run reports drift without mutation', async () => {
    const { service, tx } = setup();
    const result = await service.reconcile('org-a', false);
    expect(result.results).toHaveLength(5);
    expect(tx.usageCounter.upsert).not.toHaveBeenCalled();
  });
  it('apply repairs only the exact tenant under lock and audits', async () => {
    const { service, tx } = setup();
    await service.reconcile('tenant-a', true);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(tx.usageCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_metric_periodStart: expect.objectContaining({
            organizationId: 'tenant-a',
          }),
        },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(5);
  });
});
