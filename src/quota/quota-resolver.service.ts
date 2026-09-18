import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  Prisma,
  QuotaMetric,
  QuotaResetPeriod,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;
export const QUOTA_CONFIGURATION_STATES = [
  'ENFORCED',
  'UNLIMITED',
  'DISABLED',
  'UNCONFIGURED',
  'LEGACY_COMPATIBILITY',
  'INACTIVE_ORGANIZATION',
  'INACTIVE_SUBSCRIPTION',
] as const;
export type QuotaConfigurationState = (typeof QUOTA_CONFIGURATION_STATES)[number];
export interface EffectiveQuota {
  organizationId: string;
  metric: QuotaMetric;
  state: QuotaConfigurationState;
  enabled: boolean;
  unlimited: boolean;
  softLimit: bigint | null;
  hardLimit: bigint | null;
  resetPeriod: QuotaResetPeriod;
  periodStart: Date;
  periodEnd: Date | null;
  planCode: string | null;
  subscriptionId: string | null;
  entitlementVersion: number | null;
}

@Injectable()
export class QuotaResolverService {
  constructor(private readonly prisma: PrismaService) {}

  resolve(
    organizationId: string,
    metric: QuotaMetric,
    now = new Date(),
    db: Db = this.prisma,
  ): Promise<EffectiveQuota> {
    return this.resolveWithDb(db, organizationId, metric, now);
  }

  private async resolveWithDb(
    db: Db,
    organizationId: string,
    metric: QuotaMetric,
    now: Date,
  ): Promise<EffectiveQuota> {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { status: true, entitlementVersion: true },
    });
    if (!organization || organization.status !== OrganizationStatus.ACTIVE)
      return this.compatibility(
        organizationId,
        metric,
        'INACTIVE_ORGANIZATION',
        organization?.entitlementVersion ?? null,
      );
    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: [
            SubscriptionStatus.PENDING,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.SUSPENDED,
          ],
        },
      },
      include: { plan: { include: { quotas: { where: { metric } } } } },
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    });
    const override = await db.organizationQuotaOverride.findUnique({
      where: { organizationId_metric: { organizationId, metric } },
    });
    if (!subscription) {
      const history = await db.subscription.count({
        where: { organizationId },
      });
      return this.compatibility(
        organizationId,
        metric,
        history === 0 ? 'LEGACY_COMPATIBILITY' : 'INACTIVE_SUBSCRIPTION',
        organization.entitlementVersion,
      );
    }
    const inTerm =
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.startAt <= now &&
      (!subscription.endAt ||
        now < subscription.endAt ||
        Boolean(
          subscription.gracePeriodEndAt && now < subscription.gracePeriodEndAt,
        ));
    if (!inTerm || !subscription.plan.isActive)
      return this.compatibility(
        organizationId,
        metric,
        'INACTIVE_SUBSCRIPTION',
        organization.entitlementVersion,
        subscription.id,
        subscription.plan.code,
      );
    const baseline = subscription.plan.quotas[0];
    if (!baseline && !override)
      return this.compatibility(
        organizationId,
        metric,
        'UNCONFIGURED',
        organization.entitlementVersion,
        subscription.id,
        subscription.plan.code,
      );
    const enabled = override?.enabled ?? baseline?.enabled ?? false;
    const unlimited = override?.isUnlimited ?? baseline?.isUnlimited ?? false;
    const softLimit = override?.softLimit ?? baseline?.softLimit ?? null;
    const hardLimit = override?.hardLimit ?? baseline?.hardLimit ?? null;
    const resetPeriod =
      override?.resetPeriod ?? baseline?.resetPeriod ?? QuotaResetPeriod.NONE;
    const period = this.period(
      resetPeriod,
      now,
      subscription.startAt,
      subscription.endAt,
    );
    const state: QuotaConfigurationState = !enabled
      ? 'DISABLED'
      : unlimited
        ? 'UNLIMITED'
        : hardLimit === null
          ? 'UNCONFIGURED'
          : 'ENFORCED';
    return {
      organizationId,
      metric,
      state,
      enabled: state === 'ENFORCED' || state === 'UNLIMITED',
      unlimited: state === 'UNLIMITED',
      softLimit,
      hardLimit,
      resetPeriod,
      ...period,
      planCode: subscription.plan.code,
      subscriptionId: subscription.id,
      entitlementVersion: organization.entitlementVersion,
    };
  }

  period(
    resetPeriod: QuotaResetPeriod,
    now: Date,
    subscriptionStart?: Date,
    subscriptionEnd?: Date | null,
  ) {
    if (resetPeriod === QuotaResetPeriod.DAILY) {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      return {
        periodStart: start,
        periodEnd: new Date(start.getTime() + 86400000),
      };
    }
    if (resetPeriod === QuotaResetPeriod.MONTHLY) {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      return {
        periodStart: start,
        periodEnd: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        ),
      };
    }
    if (resetPeriod === QuotaResetPeriod.SUBSCRIPTION_TERM && subscriptionStart)
      return {
        periodStart: subscriptionStart,
        periodEnd: subscriptionEnd ?? null,
      };
    return { periodStart: new Date(0), periodEnd: null };
  }

  private compatibility(
    organizationId: string,
    metric: QuotaMetric,
    state: QuotaConfigurationState,
    entitlementVersion: number | null,
    subscriptionId: string | null = null,
    planCode: string | null = null,
  ): EffectiveQuota {
    return {
      organizationId,
      metric,
      state,
      enabled: false,
      unlimited: true,
      softLimit: null,
      hardLimit: null,
      resetPeriod: QuotaResetPeriod.NONE,
      periodStart: new Date(0),
      periodEnd: null,
      planCode,
      subscriptionId,
      entitlementVersion,
    };
  }
}
