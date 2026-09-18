import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FeatureKey, Prisma, SubscriptionStatus } from '@prisma/client';
import type { PlatformScopeContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, CreateSubscriptionDto, SetEntitlementOverrideDto, SetPlanFeatureDto, TransitionSubscriptionDto, UpdatePlanDto, UpdateSubscriptionDto } from './dto/entitlement.dto';

const TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  PENDING: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  ACTIVE: [SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
  SUSPENDED: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
  CANCELLED: [], EXPIRED: [],
};

@Injectable()
export class PlatformEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}
  plans() { return this.prisma.plan.findMany({ include: { features: true, _count: { select: { subscriptions: true } } }, orderBy: { code: 'asc' } }); }
  async createPlan(dto: CreatePlanDto, platform: PlatformScopeContext) {
    try { return await this.prisma.$transaction(async (tx) => { const plan = await tx.plan.create({ data: dto }); await this.audit(tx, platform, 'plan.created', plan.id, null, plan); return plan; }); }
    catch (error) { this.conflict(error, 'Plan code already exists'); }
  }
  async updatePlan(id: string, dto: UpdatePlanDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => { const current = await tx.plan.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Plan not found'); const plan = await tx.plan.update({ where: { id }, data: { ...dto, revision: { increment: 1 } } }); await this.bumpPlanSubscribers(tx, id); await this.audit(tx, platform, dto.isActive === false ? 'plan.deactivated' : 'plan.updated', id, current, plan); return plan; });
  }
  async setFeature(planId: string, feature: FeatureKey, dto: SetPlanFeatureDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => { const plan = await tx.plan.findUnique({ where: { id: planId } }); if (!plan) throw new NotFoundException('Plan not found'); const before = await tx.planFeature.findUnique({ where: { planId_feature: { planId, feature } } }); const item = await tx.planFeature.upsert({ where: { planId_feature: { planId, feature } }, create: { planId, feature, enabled: dto.enabled, value: dto.value as Prisma.InputJsonValue | undefined }, update: { enabled: dto.enabled, value: dto.value as Prisma.InputJsonValue | undefined } }); await tx.plan.update({ where: { id: planId }, data: { revision: { increment: 1 } } }); await this.bumpPlanSubscribers(tx, planId); await this.audit(tx, platform, 'plan-feature.changed', item.id, before, item, { planId, feature }); return item; });
  }
  async currentSubscription(organizationId: string) { return this.prisma.subscription.findFirst({ where: { organizationId, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } }, include: { plan: { include: { features: true } } } }); }
  async createSubscription(organizationId: string, dto: CreateSubscriptionDto, platform: PlatformScopeContext) {
    const startAt = new Date(dto.startAt), endAt = dto.endAt ? new Date(dto.endAt) : null, grace = dto.gracePeriodEndAt ? new Date(dto.gracePeriodEndAt) : null;
    const initialStatus = dto.status ?? SubscriptionStatus.PENDING;
    const allowedInitialStatuses: SubscriptionStatus[] = [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE];
    if (!allowedInitialStatuses.includes(initialStatus)) throw new BadRequestException('New subscriptions must start PENDING or ACTIVE');
    if (endAt && endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
    if (grace && (!endAt || grace <= endAt)) throw new BadRequestException('gracePeriodEndAt must be after endAt');
    if (dto.type === 'TRIAL' && !endAt) throw new BadRequestException('Trial subscriptions require endAt');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const [organization, plan, current] = await Promise.all([tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } }), tx.plan.findFirst({ where: { id: dto.planId, isActive: true } }), tx.subscription.findFirst({ where: { organizationId, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } } })]);
      if (!organization) throw new NotFoundException('Organization not found'); if (!plan) throw new BadRequestException('Plan is missing or inactive'); if (current) throw new ConflictException('Organization already has a current subscription');
      const subscription = await tx.subscription.create({ data: { organizationId, planId: plan.id, type: dto.type, status: initialStatus, startAt, endAt, gracePeriodEndAt: grace, contractReference: dto.contractReference, internalNote: dto.internalNote, createdById: platform.userId } });
      await this.bump(tx, organizationId); await this.audit(tx, platform, 'subscription.created', subscription.id, null, this.safeSubscription(subscription), { targetOrganizationId: organizationId }); return this.safeSubscription(subscription);
    });
  }
  async updateSubscription(id: string, dto: UpdateSubscriptionDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Subscription not found'); await this.lock(tx, current.organizationId);
      const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt, endAt = dto.endAt === null ? null : dto.endAt ? new Date(dto.endAt) : current.endAt, grace = dto.gracePeriodEndAt === null ? null : dto.gracePeriodEndAt ? new Date(dto.gracePeriodEndAt) : current.gracePeriodEndAt;
      if (endAt && endAt <= startAt) throw new BadRequestException('endAt must be after startAt'); if (grace && (!endAt || grace <= endAt)) throw new BadRequestException('gracePeriodEndAt must be after endAt'); if (current.type === 'TRIAL' && !endAt) throw new BadRequestException('Trial subscriptions require endAt');
      if (dto.planId && !await tx.plan.findFirst({ where: { id: dto.planId, isActive: true }, select: { id: true } })) throw new BadRequestException('Plan is missing or inactive');
      const updated = await tx.subscription.update({ where: { id }, data: { ...(dto.planId && { planId: dto.planId }), startAt, endAt, gracePeriodEndAt: grace, ...(dto.contractReference !== undefined && { contractReference: dto.contractReference }), ...(dto.internalNote !== undefined && { internalNote: dto.internalNote }) } }); await this.bump(tx, current.organizationId); await this.audit(tx, platform, 'subscription.updated', id, this.safeSubscription(current), this.safeSubscription(updated), { targetOrganizationId: current.organizationId }); return this.safeSubscription(updated);
    });
  }
  async transition(id: string, dto: TransitionSubscriptionDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => { const current = await tx.subscription.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Subscription not found'); await this.lock(tx, current.organizationId); if (current.status === dto.status) return this.safeSubscription(current); if (!TRANSITIONS[current.status].includes(dto.status)) throw new ConflictException(`Invalid subscription transition: ${current.status} -> ${dto.status}`); const updated = await tx.subscription.update({ where: { id }, data: { status: dto.status } }); await this.bump(tx, current.organizationId); await this.audit(tx, platform, `subscription.${dto.status.toLowerCase()}`, id, this.safeSubscription(current), this.safeSubscription(updated), { targetOrganizationId: current.organizationId }); return this.safeSubscription(updated); });
  }
  listOverrides(organizationId: string) { return this.prisma.organizationEntitlement.findMany({ where: { organizationId }, orderBy: { feature: 'asc' } }); }
  async setOverride(organizationId: string, feature: FeatureKey, dto: SetEntitlementOverrideDto, platform: PlatformScopeContext) {
    return this.prisma.$transaction(async (tx) => { if (!await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } })) throw new NotFoundException('Organization not found'); const before = await tx.organizationEntitlement.findUnique({ where: { organizationId_feature: { organizationId, feature } } }); const item = await tx.organizationEntitlement.upsert({ where: { organizationId_feature: { organizationId, feature } }, create: { organizationId, feature, state: dto.state, reason: dto.reason, createdById: platform.userId }, update: { state: dto.state, reason: dto.reason, createdById: platform.userId } }); await this.bump(tx, organizationId); await this.audit(tx, platform, before ? 'entitlement-override.updated' : 'entitlement-override.created', item.id, before, item, { targetOrganizationId: organizationId, feature }); return item; });
  }
  async removeOverride(organizationId: string, feature: FeatureKey, platform: PlatformScopeContext) { return this.prisma.$transaction(async (tx) => { const current = await tx.organizationEntitlement.findUnique({ where: { organizationId_feature: { organizationId, feature } } }); if (!current) throw new NotFoundException('Entitlement override not found'); await tx.organizationEntitlement.delete({ where: { organizationId_feature: { organizationId, feature } } }); await this.bump(tx, organizationId); await this.audit(tx, platform, 'entitlement-override.removed', current.id, current, null, { targetOrganizationId: organizationId, feature }); return { removed: true }; }); }
  private lock(tx: Prisma.TransactionClient, organizationId: string) { return tx.$queryRaw<Array<{ lockResult: string | null }>>(Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtext(${`subscription:${organizationId}`})) AS TEXT) AS "lockResult"`); }
  private bump(tx: Prisma.TransactionClient, organizationId: string) { return tx.organization.update({ where: { id: organizationId }, data: { entitlementVersion: { increment: 1 } } }); }
  private async bumpPlanSubscribers(tx: Prisma.TransactionClient, planId: string) { const rows = await tx.subscription.findMany({ where: { planId, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } }, distinct: ['organizationId'], select: { organizationId: true } }); if (rows.length) await tx.organization.updateMany({ where: { id: { in: rows.map((row) => row.organizationId) } }, data: { entitlementVersion: { increment: 1 } } }); }
  private audit(tx: Prisma.TransactionClient, platform: PlatformScopeContext, action: string, entityId: string, before: unknown, after: unknown, metadata?: Record<string, unknown>) { return tx.auditLog.create({ data: { actorId: platform.userId, actorType: 'PLATFORM_ADMIN', scope: 'PLATFORM', source: 'PLATFORM', result: 'SUCCESS', organizationId: null, entityType: 'commercial-entitlement', entityId, action, before: before as Prisma.InputJsonValue ?? undefined, after: after as Prisma.InputJsonValue ?? undefined, metadata: { platformRole: platform.platformRole, ...metadata } as Prisma.InputJsonValue, requestId: platform.requestId ?? null } }); }
  private safeSubscription<T extends { internalNote?: string | null }>(value: T) { const { internalNote: _internalNote, ...safe } = value; return safe; }
  private conflict(error: unknown, message: string): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(message); throw error; }
}
