import {
  OrganizationStatus,
  QuotaMetric,
  QuotaResetPeriod,
  SubscriptionStatus,
} from '@prisma/client';
import { QuotaResolverService } from '../src/quota/quota-resolver.service';

const now = new Date('2026-08-13T12:00:00.000Z');
function setup(
  input: {
    quota?: any;
    override?: any;
    subscription?: any;
    history?: number;
    status?: OrganizationStatus;
  } = {},
) {
  const subscription =
    input.subscription === undefined
      ? {
          id: 'sub-a',
          status: SubscriptionStatus.ACTIVE,
          startAt: new Date('2026-08-01'),
          endAt: new Date('2026-09-01'),
          gracePeriodEndAt: null,
          plan: {
            code: 'BUSINESS',
            isActive: true,
            quotas:
              input.quota === undefined
                ? [
                    {
                      enabled: true,
                      isUnlimited: false,
                      softLimit: 80n,
                      hardLimit: 100n,
                      resetPeriod: QuotaResetPeriod.MONTHLY,
                    },
                  ]
                : input.quota
                  ? [input.quota]
                  : [],
          },
        }
      : input.subscription;
  const prisma: any = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({
        status: input.status ?? OrganizationStatus.ACTIVE,
        entitlementVersion: 7,
      }),
    },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(subscription),
      count: jest.fn().mockResolvedValue(input.history ?? 0),
    },
    organizationQuotaOverride: {
      findUnique: jest.fn().mockResolvedValue(input.override ?? null),
    },
  };
  return { prisma, service: new QuotaResolverService(prisma) };
}
describe('QuotaResolverService fix 000093', () => {
  it('resolves a Plan baseline and monthly UTC boundary', async () =>
    expect(
      await setup().service.resolve('org-a', QuotaMetric.COMPANIES, now),
    ).toMatchObject({
      state: 'ENFORCED',
      softLimit: 80n,
      hardLimit: 100n,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
    }));
  it('applies tenant override precedence', async () =>
    expect(
      await setup({
        override: {
          enabled: true,
          isUnlimited: false,
          softLimit: 8n,
          hardLimit: 10n,
          resetPeriod: QuotaResetPeriod.DAILY,
        },
      }).service.resolve('org-a', QuotaMetric.COMPANIES, now),
    ).toMatchObject({
      hardLimit: 10n,
      resetPeriod: QuotaResetPeriod.DAILY,
      periodStart: new Date('2026-08-13T00:00:00.000Z'),
    }));
  it('supports explicit unlimited and disabled quota', async () => {
    expect(
      (
        await setup({
          quota: {
            enabled: true,
            isUnlimited: true,
            softLimit: null,
            hardLimit: null,
            resetPeriod: QuotaResetPeriod.NONE,
          },
        }).service.resolve('org-a', QuotaMetric.API_CALLS, now)
      ).state,
    ).toBe('UNLIMITED');
    expect(
      (
        await setup({
          quota: {
            enabled: false,
            isUnlimited: false,
            softLimit: null,
            hardLimit: 0n,
            resetPeriod: QuotaResetPeriod.NONE,
          },
        }).service.resolve('org-a', QuotaMetric.API_CALLS, now)
      ).state,
    ).toBe('DISABLED');
  });
  it('does not invent a quota for legacy compatibility', async () =>
    expect(
      await setup({ subscription: null, history: 0 }).service.resolve(
        'org-a',
        QuotaMetric.COMPANIES,
        now,
      ),
    ).toMatchObject({
      state: 'LEGACY_COMPATIBILITY',
      enabled: false,
      unlimited: true,
    }));
  it('distinguishes missing configuration from legacy compatibility', async () =>
    expect(
      (
        await setup({ quota: null }).service.resolve(
          'org-a',
          QuotaMetric.COMPANIES,
          now,
        )
      ).state,
    ).toBe('UNCONFIGURED'));
  it.each([
    OrganizationStatus.PENDING_SETUP,
    OrganizationStatus.SUSPENDED,
    OrganizationStatus.ARCHIVED,
  ])('fails closed for lifecycle %s', async (status) =>
    expect(
      (
        await setup({ status }).service.resolve(
          'org-a',
          QuotaMetric.COMPANIES,
          now,
        )
      ).state,
    ).toBe('INACTIVE_ORGANIZATION'),
  );
  it.each([SubscriptionStatus.PENDING, SubscriptionStatus.SUSPENDED])(
    'does not enforce an ineffective %s subscription',
    async (status) => {
      const current = {
        id: 'sub-a',
        status,
        startAt: new Date('2026-08-01'),
        endAt: new Date('2026-09-01'),
        gracePeriodEndAt: null,
        plan: {
          code: 'BUSINESS',
          isActive: true,
          quotas: [
            {
              enabled: true,
              isUnlimited: false,
              softLimit: 8n,
              hardLimit: 10n,
              resetPeriod: QuotaResetPeriod.MONTHLY,
            },
          ],
        },
      };
      expect(
        (
          await setup({ subscription: current }).service.resolve(
            'org-a',
            QuotaMetric.COMPANIES,
            now,
          )
        ).state,
      ).toBe('INACTIVE_SUBSCRIPTION');
    },
  );
  it('uses subscription term boundaries without local-time conversion', async () =>
    expect(
      await setup({
        quota: {
          enabled: true,
          isUnlimited: false,
          softLimit: null,
          hardLimit: 10n,
          resetPeriod: QuotaResetPeriod.SUBSCRIPTION_TERM,
        },
      }).service.resolve('org-a', QuotaMetric.COMPANIES, now),
    ).toMatchObject({
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-09-01'),
    }));
  it('queries only the supplied trusted organization', async () => {
    const { prisma, service } = setup();
    await service.resolve('tenant-a', QuotaMetric.FILES, now);
    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'tenant-a' }),
      }),
    );
  });
});
