import { Injectable, Logger } from '@nestjs/common';
import { Prisma, QuotaMetric, UsageReservationStatus } from '@prisma/client';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTA_RESERVATION_TTL_MS, QUOTA_THRESHOLDS } from './quota.constants';
import { QuotaExceededException } from './quota-exceeded.exception';
import { EffectiveQuota, QuotaResolverService } from './quota-resolver.service';
import type { QuotaSummaryDto } from './dto/quota-summary-response.dto';

type Tx = Prisma.TransactionClient;
export interface UsageReservationResult {
  reservationId: string | null;
  status: 'RESERVED' | 'ALREADY_RESERVED' | 'BYPASSED';
  quota: EffectiveQuota;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: QuotaResolverService,
  ) {}

  reserveForTenant(
    tenant: TenantContext,
    metric: QuotaMetric,
    amount: bigint,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.reserve(
      tenant.organizationId,
      metric,
      amount,
      idempotencyKey,
      now,
      tenant.userId,
      tenant.requestId,
    );
  }

  async reserve(
    organizationId: string,
    metric: QuotaMetric,
    amount: bigint,
    idempotencyKey: string,
    now = new Date(),
    actorId?: string | null,
    requestId?: string | null,
  ): Promise<UsageReservationResult> {
    this.assertAmount(amount, idempotencyKey);
    let violation: {
      current: bigint;
      limit: bigint;
      resetAt: Date | null;
    } | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId, metric);
      const quota = await this.resolver.resolve(
        organizationId,
        metric,
        now,
        tx,
      );
      const counter = await this.counter(tx, quota);
      await tx.usageReservation.updateMany({
        where: {
          counterId: counter.id,
          status: UsageReservationStatus.RESERVED,
          expiresAt: { lte: now },
        },
        data: { status: UsageReservationStatus.EXPIRED, releasedAt: now },
      });
      const existing = await tx.usageReservation.findUnique({
        where: {
          organizationId_metric_idempotencyKey: {
            organizationId,
            metric,
            idempotencyKey,
          },
        },
      });
      if (existing && existing.amount !== amount)
        throw new Error('Quota idempotency key amount mismatch');
      if (
        existing &&
        (existing.status === UsageReservationStatus.RESERVED ||
          existing.status === UsageReservationStatus.COMMITTED)
      )
        return {
          reservationId: existing.id,
          status: 'ALREADY_RESERVED' as const,
          quota,
        };
      const reserved = await tx.usageReservation.aggregate({
        where: {
          counterId: counter.id,
          status: UsageReservationStatus.RESERVED,
        },
        _sum: { amount: true },
      });
      const projected =
        counter.currentValue + (reserved._sum.amount ?? 0n) + amount;
      if (
        quota.enabled &&
        !quota.unlimited &&
        quota.hardLimit !== null &&
        projected > quota.hardLimit
      ) {
        violation = {
          current: counter.currentValue + (reserved._sum.amount ?? 0n),
          limit: quota.hardLimit,
          resetAt: quota.periodEnd,
        };
        return { reservationId: null, status: 'BYPASSED' as const, quota };
      }
      const reservation = existing
        ? await tx.usageReservation.update({
            where: { id: existing.id },
            data: {
              counterId: counter.id,
              amount,
              status: UsageReservationStatus.RESERVED,
              expiresAt: new Date(now.getTime() + QUOTA_RESERVATION_TTL_MS),
              committedAt: null,
              releasedAt: null,
            },
          })
        : await tx.usageReservation.create({
            data: {
              organizationId,
              counterId: counter.id,
              metric,
              idempotencyKey,
              amount,
              expiresAt: new Date(now.getTime() + QUOTA_RESERVATION_TTL_MS),
            },
          });
      return {
        reservationId: reservation.id,
        status: 'RESERVED' as const,
        quota,
      };
    });
    if (violation) {
      const failure = violation as {
        current: bigint;
        limit: bigint;
        resetAt: Date | null;
      };
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          actorId: actorId ?? null,
          entityType: 'quota',
          action: 'quota.hard-limit-exceeded',
          requestId: requestId ?? null,
          metadata: {
            metric,
            current: failure.current.toString(),
            requested: amount.toString(),
            limit: failure.limit.toString(),
            periodEnd: failure.resetAt?.toISOString() ?? null,
          },
        },
      });
      this.logger.warn(
        `Quota exceeded organizationId=${organizationId} metric=${metric}`,
      );
      throw new QuotaExceededException(
        metric,
        failure.current,
        amount,
        failure.limit,
        failure.resetAt,
      );
    }
    return result;
  }

  async commitReservation(reservationId: string | null, now = new Date()) {
    if (!reservationId) return { committed: false, bypassed: true };
    const result = await this.commitReservations([reservationId], now);
    return result[0] ?? { committed: false, missing: true };
  }

  async commitReservations(
    reservationIds: Array<string | null>,
    now = new Date(),
  ) {
    const ids = [
      ...new Set(reservationIds.filter((id): id is string => Boolean(id))),
    ];
    if (!ids.length) return [];
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.usageReservation.findMany({
        where: { id: { in: ids } },
      });
      const lockKeys = [
        ...new Set(rows.map((row) => `${row.organizationId}:${row.metric}`)),
      ].sort();
      for (const key of lockKeys) {
        const separator = key.lastIndexOf(':');
        await this.lock(
          tx,
          key.slice(0, separator),
          key.slice(separator + 1) as QuotaMetric,
        );
      }
      const results: Array<{
        committed: boolean;
        missing?: boolean;
        idempotent?: boolean;
        currentValue?: bigint;
      }> = [];
      for (const id of ids) {
        const current = await tx.usageReservation.findUnique({ where: { id } });
        if (!current) {
          results.push({ committed: false, missing: true });
          continue;
        }
        if (current.status !== UsageReservationStatus.RESERVED) {
          results.push({
            committed: current.status === UsageReservationStatus.COMMITTED,
            idempotent: true,
          });
          continue;
        }
        const counter = await tx.usageCounter.update({
          where: { id: current.counterId },
          data: {
            currentValue: { increment: current.amount },
            version: { increment: 1 },
          },
        });
        await tx.usageReservation.update({
          where: { id: current.id },
          data: { status: UsageReservationStatus.COMMITTED, committedAt: now },
        });
        await this.thresholds(
          tx,
          counter.organizationId,
          counter.metric,
          counter.periodStart,
          counter.currentValue,
          counter.effectiveHardLimit,
          now,
        );
        results.push({ committed: true, currentValue: counter.currentValue });
      }
      return results;
    });
  }

  async releaseReservation(reservationId: string | null, now = new Date()) {
    if (!reservationId) return { released: false, bypassed: true };
    const result = await this.prisma.usageReservation.updateMany({
      where: { id: reservationId, status: UsageReservationStatus.RESERVED },
      data: { status: UsageReservationStatus.RELEASED, releasedAt: now },
    });
    return { released: result.count === 1 };
  }

  async consumeEvent(
    organizationId: string,
    metric: QuotaMetric,
    amount: bigint,
    idempotencyKey: string,
    now = new Date(),
    actorId?: string | null,
    requestId?: string | null,
  ) {
    const reservation = await this.reserve(
      organizationId,
      metric,
      amount,
      `event:${idempotencyKey}`,
      now,
      actorId,
      requestId,
    );
    if (!reservation.reservationId)
      return { consumed: false, compatibility: true, quota: reservation.quota };
    const recorded = await this.prisma.$transaction(
      async (tx) =>
        (
          await tx.usageEvent.createMany({
            data: [
              {
                organizationId,
                metric,
                idempotencyKey,
                amount,
                periodStart: reservation.quota.periodStart,
              },
            ],
            skipDuplicates: true,
          })
        ).count === 1,
    );
    if (recorded) await this.commitReservation(reservation.reservationId, now);
    else if (reservation.status === 'RESERVED')
      await this.releaseReservation(reservation.reservationId, now);
    return {
      consumed: recorded,
      idempotent: !recorded,
      quota: reservation.quota,
    };
  }

  async summaryForTenant(tenant: TenantContext, now = new Date()): Promise<QuotaSummaryDto> {
    const metrics = Object.values(QuotaMetric);
    return {
      organizationId: tenant.organizationId,
      generatedAt: now.toISOString(),
      metrics: await Promise.all(
        metrics.map(async (metric) => {
          const quota = await this.resolver.resolve(
            tenant.organizationId,
            metric,
            now,
          );
          const counter = await this.prisma.usageCounter.findUnique({
            where: {
              organizationId_metric_periodStart: {
                organizationId: tenant.organizationId,
                metric,
                periodStart: quota.periodStart,
              },
            },
            select: { currentValue: true },
          });
          const authoritative = counter
            ? null
            : await this.authoritativeInventory(
                this.prisma as unknown as Tx,
                tenant.organizationId,
                metric,
              );
          const current = counter?.currentValue ?? authoritative ?? 0n;
          const basis =
            quota.hardLimit && quota.hardLimit > 0n
              ? Number((current * 10000n) / quota.hardLimit)
              : null;
          return {
            metric,
            state: quota.state,
            current: current.toString(),
            softLimit: quota.softLimit?.toString() ?? null,
            hardLimit: quota.hardLimit?.toString() ?? null,
            resetPeriod: quota.resetPeriod,
            resetAt: quota.periodEnd?.toISOString() ?? null,
            threshold:
              basis === null
                ? null
                : basis >= 9000
                  ? 90
                  : basis >= 8000
                    ? 80
                    : null,
          };
        }),
      ),
    };
  }

  private async counter(tx: Tx, quota: EffectiveQuota) {
    const baseline = await this.authoritativeInventory(
      tx,
      quota.organizationId,
      quota.metric,
    );
    return tx.usageCounter.upsert({
      where: {
        organizationId_metric_periodStart: {
          organizationId: quota.organizationId,
          metric: quota.metric,
          periodStart: quota.periodStart,
        },
      },
      create: {
        organizationId: quota.organizationId,
        metric: quota.metric,
        periodStart: quota.periodStart,
        periodEnd: quota.periodEnd,
        currentValue: baseline ?? 0n,
        effectiveSoftLimit: quota.softLimit,
        effectiveHardLimit: quota.hardLimit,
        resetPeriod: quota.resetPeriod,
        configurationState: quota.state,
      },
      update: {
        periodEnd: quota.periodEnd,
        effectiveSoftLimit: quota.softLimit,
        effectiveHardLimit: quota.hardLimit,
        resetPeriod: quota.resetPeriod,
        configurationState: quota.state,
      },
    });
  }

  async synchronizeInventory(
    organizationId: string,
    metric: QuotaMetric,
    now = new Date(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId, metric);
      const quota = await this.resolver.resolve(
        organizationId,
        metric,
        now,
        tx,
      );
      const value = await this.authoritativeInventory(
        tx,
        organizationId,
        metric,
      );
      if (value === null) throw new Error(`${metric} is not inventory`);
      return tx.usageCounter.upsert({
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
          currentValue: value,
          effectiveSoftLimit: quota.softLimit,
          effectiveHardLimit: quota.hardLimit,
          resetPeriod: quota.resetPeriod,
          configurationState: quota.state,
        },
        update: { currentValue: value, version: { increment: 1 } },
      });
    });
  }

  private async authoritativeInventory(
    tx: Tx,
    organizationId: string,
    metric: QuotaMetric,
  ): Promise<bigint | null> {
    if (metric === QuotaMetric.ACTIVE_USERS)
      return BigInt(
        await tx.organizationMembership.count({
          where: { organizationId, status: 'ACTIVE', user: { isActive: true } },
        }),
      );
    if (metric === QuotaMetric.COMPANIES)
      return BigInt(
        await tx.company.count({ where: { organizationId, archivedAt: null } }),
      );
    if (metric === QuotaMetric.OPPORTUNITIES)
      return BigInt(
        await tx.opportunity.count({
          where: {
            organizationId,
            archivedAt: null,
            company: { archivedAt: null },
          },
        }),
      );
    if (metric === QuotaMetric.FILES)
      return BigInt(
        await tx.fileAttachment.count({
          where: { organizationId, deletedAt: null },
        }),
      );
    if (metric === QuotaMetric.STORAGE_BYTES) {
      const total = await tx.fileAttachment.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: { sizeBytes: true },
      });
      return BigInt(total._sum.sizeBytes ?? 0);
    }
    return null;
  }

  private async thresholds(
    tx: Tx,
    organizationId: string,
    metric: QuotaMetric,
    periodStart: Date,
    usage: bigint,
    limit: bigint | null,
    now: Date,
  ) {
    if (!limit || limit <= 0n) return;
    for (const threshold of QUOTA_THRESHOLDS)
      if (usage * 100n >= limit * BigInt(threshold)) {
        const created = await tx.quotaThresholdEvent.createMany({
          data: [
            {
              organizationId,
              metric,
              periodStart,
              threshold,
              usageValue: usage,
              limitValue: limit,
              createdAt: now,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count)
          await tx.auditLog.create({
            data: {
              organizationId,
              entityType: 'quota',
              action: `quota.threshold-${threshold}`,
              metadata: {
                metric,
                usage: usage.toString(),
                limit: limit.toString(),
                threshold,
                periodStart: periodStart.toISOString(),
              },
            },
          });
      }
  }

  private lock(tx: Tx, organizationId: string, metric: QuotaMetric) {
    return tx.$queryRaw<Array<{ lockResult: string | null }>>(
      Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtext(${`quota:${organizationId}:${metric}`})) AS TEXT) AS "lockResult"`,
    );
  }
  private assertAmount(amount: bigint, idempotencyKey: string) {
    if (amount <= 0n) throw new Error('Quota amount must be positive');
    if (!idempotencyKey.trim())
      throw new Error('Quota idempotency key is required');
  }
}
