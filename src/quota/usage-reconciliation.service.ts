import { Injectable } from '@nestjs/common';
import { Prisma, QuotaMetric } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_METRICS } from './quota.constants';
import { QuotaResolverService } from './quota-resolver.service';

@Injectable()
export class UsageReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: QuotaResolverService,
  ) {}

  async authoritative(
    organizationId: string,
    metric: QuotaMetric,
  ): Promise<bigint> {
    switch (metric) {
      case QuotaMetric.ACTIVE_USERS:
        return BigInt(
          await this.prisma.organizationMembership.count({
            where: {
              organizationId,
              status: 'ACTIVE',
              user: { isActive: true },
            },
          }),
        );
      case QuotaMetric.COMPANIES:
        return BigInt(
          await this.prisma.company.count({
            where: { organizationId, archivedAt: null },
          }),
        );
      case QuotaMetric.OPPORTUNITIES:
        return BigInt(
          await this.prisma.opportunity.count({
            where: {
              organizationId,
              archivedAt: null,
              company: { archivedAt: null },
            },
          }),
        );
      case QuotaMetric.FILES:
        return BigInt(
          await this.prisma.fileAttachment.count({
            where: { organizationId, deletedAt: null },
          }),
        );
      case QuotaMetric.STORAGE_BYTES: {
        const total = await this.prisma.fileAttachment.aggregate({
          where: { organizationId, deletedAt: null },
          _sum: { sizeBytes: true },
        });
        return BigInt(total._sum.sizeBytes ?? 0);
      }
      default:
        throw new Error(`${metric} is not an inventory metric`);
    }
  }

  async reconcile(organizationId: string, apply: boolean, now = new Date()) {
    const results: Array<{
      metric: QuotaMetric;
      stored: string;
      authoritative: string;
      delta: string;
      changed: boolean;
    }> = [];
    for (const metric of INVENTORY_METRICS) {
      const quota = await this.resolver.resolve(organizationId, metric, now);
      const authoritative = await this.authoritative(organizationId, metric);
      const current = await this.prisma.usageCounter.findUnique({
        where: {
          organizationId_metric_periodStart: {
            organizationId,
            metric,
            periodStart: quota.periodStart,
          },
        },
      });
      const stored = current?.currentValue ?? 0n;
      if (apply && (!current || stored !== authoritative))
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ lockResult: string | null }>>(
            Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtext(${`quota:${organizationId}:${metric}`})) AS TEXT) AS "lockResult"`,
          );
          const row = await tx.usageCounter.upsert({
            where: {
              organizationId_metric_periodStart: {
                organizationId,
                metric,
                periodStart: quota.periodStart,
              },
            },
            create: {
              organizationId,
              metric,
              periodStart: quota.periodStart,
              periodEnd: quota.periodEnd,
              currentValue: authoritative,
              effectiveSoftLimit: quota.softLimit,
              effectiveHardLimit: quota.hardLimit,
              resetPeriod: quota.resetPeriod,
              configurationState: quota.state,
            },
            update: { currentValue: authoritative, version: { increment: 1 } },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              entityType: 'quota',
              entityId: row.id,
              action: current
                ? 'quota.reconciliation-adjusted'
                : 'quota.baseline-created',
              before: { usage: stored.toString() },
              after: { usage: authoritative.toString() },
              metadata: {
                metric,
                periodStart: quota.periodStart.toISOString(),
              },
            },
          });
        });
      results.push({
        metric,
        stored: stored.toString(),
        authoritative: authoritative.toString(),
        delta: (authoritative - stored).toString(),
        changed: !current || stored !== authoritative,
      });
    }
    return { organizationId, mode: apply ? 'apply' : 'dry-run', results };
  }
}
