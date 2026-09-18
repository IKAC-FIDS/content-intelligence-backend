import { PrismaClient } from '@prisma/client';
import {
  EVENT_METRICS,
  INVENTORY_METRICS,
  QUOTA_METRICS,
} from './quota.constants';
import { QuotaResolverService } from './quota-resolver.service';
import { UsageReconciliationService } from './usage-reconciliation.service';

export class QuotaMaintenance {
  private readonly resolver: QuotaResolverService;
  private readonly reconciliation: UsageReconciliationService;
  constructor(private readonly prisma: PrismaClient) {
    this.resolver = new QuotaResolverService(prisma as never);
    this.reconciliation = new UsageReconciliationService(
      prisma as never,
      this.resolver,
    );
  }

  async preflight(organizationId?: string) {
    const orgWhere = organizationId ? { id: organizationId } : {};
    const [
      organizations,
      plans,
      planQuotas,
      overrides,
      counters,
      snapshots,
      reservations,
      events,
    ] = await Promise.all([
      this.prisma.organization.findMany({
        where: orgWhere,
        select: {
          id: true,
          code: true,
          status: true,
          entitlementVersion: true,
          authorizationVersion: true,
        },
      }),
      this.prisma.plan.findMany({
        select: {
          id: true,
          code: true,
          isActive: true,
          _count: { select: { quotas: true, subscriptions: true } },
        },
      }),
      this.prisma.planQuota.count(),
      this.prisma.organizationQuotaOverride.count({
        where: organizationId ? { organizationId } : {},
      }),
      this.prisma.usageCounter.count({
        where: organizationId ? { organizationId } : {},
      }),
      this.prisma.usageSnapshot.count({
        where: organizationId ? { organizationId } : {},
      }),
      this.prisma.usageReservation.count({
        where: organizationId ? { organizationId } : {},
      }),
      this.prisma.usageEvent.count({
        where: organizationId ? { organizationId } : {},
      }),
    ]);
    return {
      organizations,
      plans,
      planQuotas,
      overrides,
      counters,
      snapshots,
      reservations,
      events,
      inventoryMetrics: [...INVENTORY_METRICS],
      eventMetrics: [...EVENT_METRICS],
      historicalEventBaseline: 'START_FROM_DEPLOYMENT',
      quotaMatrix: plans.every(
        (plan) => plan._count.quotas === QUOTA_METRICS.length,
      )
        ? 'STRUCTURALLY_COMPLETE_REQUIRES_LIMIT_APPROVAL'
        : 'QUOTA_MATRIX_REQUIRES_COMMERCIAL_APPROVAL',
    };
  }

  async bootstrap(apply: boolean) {
    const plans = await this.prisma.plan.findMany({
      select: { id: true, code: true, quotas: { select: { metric: true } } },
    });
    const missing = plans.flatMap((plan) =>
      QUOTA_METRICS.filter(
        (metric) => !plan.quotas.some((row) => row.metric === metric),
      ).map((metric) => ({ planId: plan.id, planCode: plan.code, metric })),
    );
    if (!apply)
      return {
        mode: 'dry-run',
        rowsToCreate: missing,
        result: 'QUOTA_MATRIX_REQUIRES_COMMERCIAL_APPROVAL',
      };
    if (missing.length)
      await this.prisma.$transaction(async (tx) => {
        await tx.planQuota.createMany({
          data: missing.map(({ planId, metric }) => ({
            planId,
            metric,
            enabled: false,
          })),
        });
        for (const plan of plans.filter((item) =>
          missing.some((row) => row.planId === item.id),
        ))
          await tx.plan.update({
            where: { id: plan.id },
            data: { revision: { increment: 1 } },
          });
        await tx.auditLog.create({
          data: {
            organizationId: null,
            entityType: 'quota',
            action: 'quota.baseline-structure-created',
            metadata: {
              rowsCreated: missing.length,
              commercialLimits: 'UNASSIGNED',
            },
          },
        });
      });
    return {
      mode: 'apply',
      created: missing.length,
      unchanged: plans.length * QUOTA_METRICS.length - missing.length,
      result: 'QUOTA_MATRIX_REQUIRES_COMMERCIAL_APPROVAL',
    };
  }

  async backfill(organizationId: string, apply: boolean) {
    if (
      !(await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      }))
    )
      throw new Error('Exact target Organization does not exist');
    const inventory = await this.reconciliation.reconcile(
      organizationId,
      apply,
    );
    return {
      ...inventory,
      historicalEventMetrics: [...EVENT_METRICS].map((metric) => ({
        metric,
        baseline: 'START_FROM_DEPLOYMENT',
        fabricatedHistory: false,
      })),
    };
  }

  reconcile(organizationId: string, apply: boolean) {
    return this.backfill(organizationId, apply);
  }
  async validate(organizationId?: string) {
    const report = await this.preflight(organizationId);
    const [invalidPlan, invalidOverride, invalidCounters] = await Promise.all([
      this.prisma.planQuota.findMany({
        where: { OR: [{ softLimit: { lt: 0 } }, { hardLimit: { lt: 0 } }] },
        select: { id: true },
      }),
      this.prisma.organizationQuotaOverride.findMany({
        where: { OR: [{ softLimit: { lt: 0 } }, { hardLimit: { lt: 0 } }] },
        select: { id: true },
      }),
      this.prisma.usageCounter.findMany({
        where: {
          currentValue: { lt: 0 },
          ...(organizationId && { organizationId }),
        },
        select: { id: true },
      }),
    ]);
    return {
      valid:
        invalidPlan.length + invalidOverride.length + invalidCounters.length ===
        0,
      invalidPlanQuotaIds: invalidPlan.map((row) => row.id),
      invalidOverrideIds: invalidOverride.map((row) => row.id),
      invalidCounterIds: invalidCounters.map((row) => row.id),
      ...report,
    };
  }
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
async function main() {
  const prisma = new PrismaClient();
  try {
    const tool = new QuotaMaintenance(prisma),
      command = process.argv[2],
      organizationId = arg('--organization'),
      apply = process.argv.includes('--confirm-apply');
    let result: unknown;
    if (command === 'preflight') result = await tool.preflight(organizationId);
    else if (command === 'bootstrap') result = await tool.bootstrap(apply);
    else if (command === 'backfill') {
      if (!organizationId)
        throw new Error('--organization exact UUID is required');
      result = await tool.backfill(organizationId, apply);
    } else if (command === 'reconcile') {
      if (!organizationId)
        throw new Error('--organization exact UUID is required');
      result = await tool.reconcile(organizationId, apply);
    } else if (command === 'validate')
      result = await tool.validate(organizationId);
    else
      throw new Error(
        'Expected preflight, bootstrap, backfill, reconcile, or validate',
      );
    process.stdout.write(
      `${JSON.stringify(result, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
