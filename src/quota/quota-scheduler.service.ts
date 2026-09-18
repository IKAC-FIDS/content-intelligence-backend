import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, UsageReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuotaSchedulerService {
  constructor(private readonly prisma: PrismaService) {}
  @Cron('0 5 * * * *')
  async finalizeClosedPeriods(now = new Date()) {
    await this.prisma.usageReservation.updateMany({
      where: {
        status: UsageReservationStatus.RESERVED,
        expiresAt: { lte: now },
      },
      data: { status: UsageReservationStatus.EXPIRED, releasedAt: now },
    });
    const pending = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT c."id" FROM "usage_counters" c
      WHERE c."periodEnd" <= ${now}
        AND NOT EXISTS (
          SELECT 1 FROM "usage_snapshots" s
          WHERE s."organizationId" = c."organizationId"
            AND s."metric" = c."metric"
            AND s."periodStart" = c."periodStart"
        )
      ORDER BY c."periodEnd" ASC
      LIMIT 500
    `);
    const closed = pending.length
      ? await this.prisma.usageCounter.findMany({
          where: { id: { in: pending.map((row) => row.id) } },
        })
      : [];
    let created = 0;
    for (const counter of closed) {
      const percentageBasisPts =
        counter.effectiveHardLimit && counter.effectiveHardLimit > 0n
          ? Number((counter.currentValue * 10000n) / counter.effectiveHardLimit)
          : null;
      const result = await this.prisma.usageSnapshot.createMany({
        data: [
          {
            organizationId: counter.organizationId,
            metric: counter.metric,
            periodStart: counter.periodStart,
            periodEnd: counter.periodEnd,
            finalUsage: counter.currentValue,
            softLimit: counter.effectiveSoftLimit,
            hardLimit: counter.effectiveHardLimit,
            percentageBasisPts,
            exceeded:
              counter.effectiveHardLimit !== null &&
              counter.currentValue > counter.effectiveHardLimit,
            capturedAt: now,
          },
        ],
        skipDuplicates: true,
      });
      if (result.count) {
        created += 1;
        await this.prisma.auditLog.create({
          data: {
            organizationId: counter.organizationId,
            entityType: 'quota',
            entityId: counter.id,
            action: 'quota.period-snapshotted',
            metadata: {
              metric: counter.metric,
              periodStart: counter.periodStart.toISOString(),
              periodEnd: counter.periodEnd?.toISOString() ?? null,
              finalUsage: counter.currentValue.toString(),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    return { created };
  }
}
