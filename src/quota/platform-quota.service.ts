import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotaMetric } from '@prisma/client';
import type { PlatformScopeContext } from '../common/tenant/tenant-context.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  SetOrganizationQuotaOverrideDto,
  SetPlanQuotaDto,
} from './dto/quota.dto';

@Injectable()
export class PlatformQuotaService {
  constructor(private readonly prisma: PrismaService) {}
  async planQuotas(planId: string) {
    return (
      await this.prisma.planQuota.findMany({
        where: { planId },
        orderBy: { metric: 'asc' },
      })
    ).map((row) => this.present(row));
  }
  async organizationOverrides(organizationId: string) {
    return (
      await this.prisma.organizationQuotaOverride.findMany({
        where: { organizationId },
        orderBy: { metric: 'asc' },
      })
    ).map((row) => this.present(row));
  }

  async setPlanQuota(
    planId: string,
    metric: QuotaMetric,
    dto: SetPlanQuotaDto,
    platform: PlatformScopeContext,
  ) {
    const limits = this.limits(dto);
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.plan.findUnique({
          where: { id: planId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Plan not found');
      const before = await tx.planQuota.findUnique({
        where: { planId_metric: { planId, metric } },
      });
      const item = await tx.planQuota.upsert({
        where: { planId_metric: { planId, metric } },
        create: { planId, metric, ...dto, ...limits },
        update: { ...dto, ...limits },
      });
      await tx.plan.update({
        where: { id: planId },
        data: { revision: { increment: 1 } },
      });
      const organizations = await tx.subscription.findMany({
        where: { planId, status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } },
        distinct: ['organizationId'],
        select: { organizationId: true },
      });
      if (organizations.length)
        await tx.organization.updateMany({
          where: { id: { in: organizations.map((row) => row.organizationId) } },
          data: { entitlementVersion: { increment: 1 } },
        });
      await this.audit(tx, platform, 'quota.plan-changed', item.id, null, {
        planId,
        metric,
        before: this.json(before),
        after: this.json(item),
      });
      return this.present(item);
    });
  }

  async setOverride(
    organizationId: string,
    metric: QuotaMetric,
    dto: SetOrganizationQuotaOverrideDto,
    platform: PlatformScopeContext,
  ) {
    const limits = this.limits(dto);
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Organization not found');
      const before = await tx.organizationQuotaOverride.findUnique({
        where: { organizationId_metric: { organizationId, metric } },
      });
      const item = await tx.organizationQuotaOverride.upsert({
        where: { organizationId_metric: { organizationId, metric } },
        create: {
          organizationId,
          metric,
          ...dto,
          ...limits,
          createdById: platform.userId,
        },
        update: { ...dto, ...limits, createdById: platform.userId },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { entitlementVersion: { increment: 1 } },
      });
      await this.audit(
        tx,
        platform,
        before ? 'quota.override-changed' : 'quota.override-created',
        item.id,
        organizationId,
        { metric, before: this.json(before), after: this.json(item) },
      );
      return this.present(item);
    });
  }

  async removeOverride(
    organizationId: string,
    metric: QuotaMetric,
    platform: PlatformScopeContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organizationQuotaOverride.findUnique({
        where: { organizationId_metric: { organizationId, metric } },
      });
      if (!before) throw new NotFoundException('Quota override not found');
      await tx.organizationQuotaOverride.delete({
        where: { organizationId_metric: { organizationId, metric } },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { entitlementVersion: { increment: 1 } },
      });
      await this.audit(
        tx,
        platform,
        'quota.override-removed',
        before.id,
        organizationId,
        { metric, before: this.json(before) },
      );
      return { removed: true };
    });
  }

  private limits(dto: {
    softLimit?: string | null;
    hardLimit?: string | null;
    isUnlimited?: boolean | null;
    enabled?: boolean | null;
  }) {
    const softLimit = dto.softLimit == null ? null : BigInt(dto.softLimit),
      hardLimit = dto.hardLimit == null ? null : BigInt(dto.hardLimit);
    if (softLimit !== null && hardLimit !== null && softLimit > hardLimit)
      throw new BadRequestException('softLimit must not exceed hardLimit');
    if (dto.isUnlimited === true && (softLimit !== null || hardLimit !== null))
      throw new BadRequestException('Unlimited quota cannot define limits');
    if (dto.enabled === true && dto.isUnlimited === false && hardLimit === null)
      throw new BadRequestException('Enabled finite quota requires hardLimit');
    return { softLimit, hardLimit };
  }
  private audit(
    tx: Prisma.TransactionClient,
    platform: PlatformScopeContext,
    action: string,
    entityId: string,
    organizationId: string | null,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        actorId: platform.userId,
        actorType: 'PLATFORM_ADMIN',
        scope: 'PLATFORM',
        source: 'PLATFORM',
        result: 'SUCCESS',
        organizationId,
        entityType: 'quota',
        entityId,
        action,
        requestId: platform.requestId ?? null,
        metadata,
      },
    });
  }
  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value, (_key, item) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    ) as Prisma.InputJsonValue;
  }
  private present<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    ) as T;
  }
}
