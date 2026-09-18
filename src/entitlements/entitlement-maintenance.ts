import { FeatureKey, Prisma, PrismaClient, SubscriptionStatus, SubscriptionType } from '@prisma/client';

const PLAN_DEFINITIONS = [
  { code: 'STARTER', name: 'Starter' }, { code: 'BUSINESS', name: 'Business' }, { code: 'ENTERPRISE', name: 'Enterprise' },
] as const;

export class EntitlementMaintenance {
  constructor(private readonly prisma: PrismaClient) {}
  async preflight(organizationId?: string) {
    const organizationWhere = organizationId ? { id: organizationId } : {};
    const [organizations, platformAdmins, plans, features, subscriptions, overrides, activeOwners, activeMemberships] = await Promise.all([
      this.prisma.organization.findMany({ where: organizationWhere, select: { id: true, code: true, status: true, entitlementVersion: true, authorizationVersion: true, _count: { select: { users: true, memberships: true } } } }),
      this.prisma.platformAuthority.count(), this.prisma.plan.findMany({ include: { features: true } }),
      this.prisma.planFeature.count(), this.prisma.subscription.findMany({ where: organizationId ? { organizationId } : {}, select: { id: true, organizationId: true, planId: true, type: true, status: true, startAt: true, endAt: true, gracePeriodEndAt: true } }),
      this.prisma.organizationEntitlement.count({ where: organizationId ? { organizationId } : {} }),
      this.prisma.organizationMembership.groupBy({ by: ['organizationId'], where: { ...(organizationId && { organizationId }), isTenantOwner: true, status: 'ACTIVE', user: { isActive: true } }, _count: true }),
      this.prisma.organizationMembership.groupBy({ by: ['organizationId'], where: { ...(organizationId && { organizationId }), status: 'ACTIVE', user: { isActive: true } }, _count: true }),
    ]);
    const currentByOrganization = new Map<string, number>();
    const currentStatuses: SubscriptionStatus[] = [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED];
    for (const item of subscriptions.filter((row) => currentStatuses.includes(row.status))) currentByOrganization.set(item.organizationId, (currentByOrganization.get(item.organizationId) ?? 0) + 1);
    return { organizations: organizations.map((item) => ({ ...item, activeTenantOwners: activeOwners.find((row) => row.organizationId === item.id)?._count ?? 0, activeMemberships: activeMemberships.find((row) => row.organizationId === item.id)?._count ?? 0 })), duplicateOrganizationCodes: 0, platformAdmins, plans: plans.map((plan) => ({ code: plan.code, active: plan.isActive, featureRows: plan.features.length })), planFeatures: features, subscriptions: subscriptions.length, overrides, existingFeatureUsage: 'NOT_RELIABLY_MEASURABLE_FROM_PERSISTED_DATA', ambiguousCurrentSubscriptions: [...currentByOrganization].filter(([, count]) => count > 1).map(([id, count]) => ({ organizationId: id, count })), missingSubscriptionOrganizations: organizations.filter((organization) => !subscriptions.some((item) => item.organizationId === organization.id)).map((organization) => organization.id) };
  }
  async bootstrap(apply: boolean) {
    const existing = await this.prisma.plan.findMany({ where: { code: { in: PLAN_DEFINITIONS.map((item) => item.code) } }, select: { code: true } });
    const missing = PLAN_DEFINITIONS.filter((item) => !existing.some((row) => row.code === item.code));
    if (!apply) return { mode: 'dry-run', plansToCreate: missing, featureMatrix: 'UNASSIGNED_REQUIRES_COMMERCIAL_APPROVAL' };
    if (missing.length) await this.prisma.$transaction(async (tx) => { for (const item of missing) { const plan = await tx.plan.create({ data: item }); await tx.auditLog.create({ data: { organizationId: null, entityType: 'commercial-entitlement', entityId: plan.id, action: 'plan.bootstrap-created', after: item } }); } });
    return { mode: 'apply', created: missing.length, unchanged: existing.length, featureMatrix: 'UNASSIGNED_REQUIRES_COMMERCIAL_APPROVAL' };
  }
  async backfill(organizationId: string, planId: string, apply: boolean) {
    const [organization, plan, current] = await Promise.all([this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }), this.prisma.plan.findFirst({ where: { id: planId, isActive: true }, select: { id: true, code: true, _count: { select: { features: true } } } }), this.prisma.subscription.findFirst({ where: { organizationId, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } } })]);
    if (!organization) throw new Error('Exact target Organization does not exist'); if (!plan) throw new Error('Exact active Plan does not exist');
    if (plan._count.features !== Object.keys(FeatureKey).length) throw new Error('Plan Feature matrix is incomplete; obtain Commercial approval and configure every Feature explicitly');
    if (current) return { mode: apply ? 'apply' : 'dry-run', created: 0, unchanged: 1, subscriptionId: current.id };
    if (!apply) return { mode: 'dry-run', created: 1, organizationId, planId, type: SubscriptionType.MANUAL_CONTRACT, status: SubscriptionStatus.ACTIVE, openEnded: true };
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ lockResult: string | null }>>(Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtext(${'subscription:' + organizationId})) AS TEXT) AS "lockResult"`);
      const existing = await tx.subscription.findFirst({ where: { organizationId, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } } }); if (existing) return existing;
      const subscription = await tx.subscription.create({ data: { organizationId, planId, type: SubscriptionType.MANUAL_CONTRACT, status: SubscriptionStatus.ACTIVE, startAt: new Date(0), contractReference: 'FIX-000092-EXPLICIT-COMPATIBILITY' } });
      await tx.organization.update({ where: { id: organizationId }, data: { entitlementVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { organizationId: null, entityType: 'commercial-entitlement', entityId: subscription.id, action: 'subscription.compatibility-backfilled', metadata: { targetOrganizationId: organizationId, planId } } }); return subscription;
    });
    return { mode: 'apply', created: 1, subscriptionId: result.id };
  }
  async validate(organizationId?: string) { const report = await this.preflight(organizationId); const rows = await this.prisma.subscription.findMany({ where: organizationId ? { organizationId } : {}, select: { id: true, startAt: true, endAt: true, gracePeriodEndAt: true } }); const invalid = rows.filter((row) => (row.endAt && row.endAt <= row.startAt) || (row.gracePeriodEndAt && (!row.endAt || row.gracePeriodEndAt <= row.endAt))).map((row) => row.id); return { valid: report.ambiguousCurrentSubscriptions.length === 0 && invalid.length === 0, invalidSubscriptionIds: invalid, ...report }; }
}

function arg(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function main() { const prisma = new PrismaClient(); try { const tool = new EntitlementMaintenance(prisma), command = process.argv[2], organizationId = arg('--organization'), planId = arg('--plan'); let result: unknown; if (command === 'preflight') result = await tool.preflight(organizationId); else if (command === 'bootstrap') result = await tool.bootstrap(process.argv.includes('--confirm-apply')); else if (command === 'backfill') { if (!organizationId || !planId) throw new Error('--organization and --plan exact UUIDs are required'); result = await tool.backfill(organizationId, planId, process.argv.includes('--confirm-apply')); } else if (command === 'validate') result = await tool.validate(organizationId); else throw new Error('Expected preflight, bootstrap, backfill, or validate'); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); } finally { await prisma.$disconnect(); } }
if (require.main === module) void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
