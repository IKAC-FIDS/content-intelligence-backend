import { Injectable } from '@nestjs/common';
import { EntitlementOverrideState, FeatureKey, OrganizationStatus, SubscriptionStatus } from '@prisma/client';
import NodeCache from 'node-cache';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURE_METADATA } from './entitlement.constants';

export type EntitlementSource = 'PLAN' | 'OVERRIDE' | 'GRACE' | 'LEGACY_COMPATIBILITY' | 'DENIED';
export interface EffectiveEntitlement { feature: FeatureKey; enabled: boolean; source: EntitlementSource; subscriptionId: string | null; planCode: string | null; }
const cache = new NodeCache({ stdTTL: 300, useClones: false });
type CacheEntry = { result: EffectiveEntitlement; validUntil: number | null };

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}
  resolveForTenant(tenant: TenantContext, feature: FeatureKey, now = new Date()) { return this.resolve(tenant.organizationId, feature, now); }
  async isFeatureEnabled(tenant: TenantContext, feature: FeatureKey) { return (await this.resolveForTenant(tenant, feature)).enabled; }

  async resolve(organizationId: string, feature: FeatureKey, now = new Date()): Promise<EffectiveEntitlement> {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_METADATA, feature)) return this.denied(feature);
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { status: true, entitlementVersion: true } });
    if (!organization || organization.status !== OrganizationStatus.ACTIVE) return this.denied(feature);
    const key = `tenant-entitlement:${organizationId}:${organization.entitlementVersion}:${feature}`;
    const cached = cache.get<CacheEntry>(key);
    if (cached && (cached.validUntil === null || now.getTime() < cached.validUntil)) return cached.result;
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } },
      include: { plan: { include: { features: { where: { feature } } } } }, orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    });
    const [override, subscriptionHistory] = await Promise.all([
      this.prisma.organizationEntitlement.findUnique({ where: { organizationId_feature: { organizationId, feature } } }),
      subscription ? Promise.resolve(1) : this.prisma.subscription.count({ where: { organizationId } }),
    ]);
    let result: EffectiveEntitlement;
    if (!subscription && subscriptionHistory === 0) {
      result = { feature, enabled: override?.state !== EntitlementOverrideState.DISABLED, source: override ? 'OVERRIDE' : 'LEGACY_COMPATIBILITY', subscriptionId: null, planCode: null };
    } else if (!subscription) {
      result = this.denied(feature);
    } else if (subscription.status !== SubscriptionStatus.ACTIVE || subscription.startAt > now) {
      result = this.denied(feature);
    } else {
      const inTerm = !subscription.endAt || now < subscription.endAt;
      const inGrace = Boolean(subscription.endAt && subscription.gracePeriodEndAt && now >= subscription.endAt && now < subscription.gracePeriodEndAt);
      if (!inTerm && !inGrace) result = this.denied(feature);
      else {
        const baseline = Boolean(subscription.plan.isActive && subscription.plan.features[0]?.enabled);
        const enabled = override ? override.state === EntitlementOverrideState.ENABLED : baseline;
        result = { feature, enabled, source: override ? 'OVERRIDE' : inGrace ? 'GRACE' : 'PLAN', subscriptionId: subscription.id, planCode: subscription.plan.code };
      }
    }
    const validUntil = subscription?.status === SubscriptionStatus.ACTIVE
      ? subscription.startAt > now
        ? subscription.startAt.getTime()
        : subscription.endAt && now < subscription.endAt
          ? subscription.endAt.getTime()
          : subscription.gracePeriodEndAt && now < subscription.gracePeriodEndAt
            ? subscription.gracePeriodEndAt.getTime()
            : null
      : null;
    cache.set(key, { result, validUntil }); return result;
  }
  async current(tenant: TenantContext) {
    const features = await Promise.all(Object.keys(FEATURE_METADATA).map((feature) => this.resolveForTenant(tenant, feature as FeatureKey)));
    return { organizationId: tenant.organizationId, features };
  }
  private denied(feature: FeatureKey): EffectiveEntitlement { return { feature, enabled: false, source: 'DENIED', subscriptionId: null, planCode: null }; }
}
