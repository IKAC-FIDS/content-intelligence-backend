import { QuotaMetric, QuotaResetPeriod } from '@prisma/client';
import { PlatformQuotaService } from '../src/quota/platform-quota.service';
const platform = {
  userId: 'platform-a',
  platformAdmin: true as const,
  platformRole: 'PLATFORM_ADMIN' as const,
  requestId: 'request-a',
};
describe('PlatformQuotaService fix 000093', () => {
  it('changes Plan quota, revision, subscriber versions and audit atomically', async () => {
    const tx: any = {
      plan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'plan-a' }),
        update: jest.fn(),
      },
      planQuota: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'quota-a', softLimit: 8n, hardLimit: 10n }),
      },
      subscription: {
        findMany: jest.fn().mockResolvedValue([{ organizationId: 'org-a' }]),
      },
      organization: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new PlatformQuotaService({
      $transaction: (callback: any) => callback(tx),
    } as any);
    const result: any = await service.setPlanQuota(
      'plan-a',
      QuotaMetric.COMPANIES,
      {
        enabled: true,
        isUnlimited: false,
        softLimit: '8',
        hardLimit: '10',
        resetPeriod: QuotaResetPeriod.MONTHLY,
      },
      platform,
    );
    expect(result.hardLimit).toBe('10');
    expect(tx.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revision: { increment: 1 } } }),
    );
    expect(tx.organization.updateMany).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it('changes tenant override and entitlement version atomically', async () => {
    const tx: any = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-a' }),
        update: jest.fn(),
      },
      organizationQuotaOverride: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'override-a', hardLimit: 5n }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new PlatformQuotaService({
      $transaction: (callback: any) => callback(tx),
    } as any);
    await service.setOverride(
      'org-a',
      QuotaMetric.COMPANIES,
      { hardLimit: '5', reason: 'contract' },
      platform,
    );
    expect(tx.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-a' },
        data: { entitlementVersion: { increment: 1 } },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
  });
  it('rejects soft above hard and unlimited with numeric limits', async () => {
    const service = new PlatformQuotaService({} as any);
    await expect(
      service.setPlanQuota(
        'p',
        QuotaMetric.COMPANIES,
        {
          enabled: true,
          isUnlimited: false,
          softLimit: '11',
          hardLimit: '10',
          resetPeriod: QuotaResetPeriod.MONTHLY,
        },
        platform,
      ),
    ).rejects.toThrow('softLimit');
    await expect(
      service.setPlanQuota(
        'p',
        QuotaMetric.COMPANIES,
        {
          enabled: true,
          isUnlimited: true,
          hardLimit: '10',
          resetPeriod: QuotaResetPeriod.MONTHLY,
        },
        platform,
      ),
    ).rejects.toThrow('Unlimited');
  });
  it('never exposes BigInt through platform API results', async () => {
    const service = new PlatformQuotaService({
      planQuota: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ softLimit: 8n, hardLimit: 10n }]),
      },
    } as any);
    expect(await service.planQuotas('plan-a')).toEqual([
      { softLimit: '8', hardLimit: '10' },
    ]);
  });
});
