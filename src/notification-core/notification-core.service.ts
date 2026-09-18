import { Injectable, Logger, Optional } from "@nestjs/common"
import { Prisma, type NotificationEvent } from "@prisma/client"
import { PrismaService, type TenantTransactionClient } from "../prisma/prisma.service"
import { notificationTenantContext } from './in-app/notification-tenant-context'
import type { PublishNotificationEventInput } from "./notification-core.types"
import { NotificationRuleEngineService } from "./notification-rule-engine.service"
import { NotificationEscalationService } from "./orchestration/notification-escalation.service"

@Injectable()
export class NotificationCoreService {
  private readonly logger = new Logger(NotificationCoreService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: NotificationRuleEngineService,
    @Optional() private readonly escalations?: NotificationEscalationService,
  ) {}

  async publish(input: PublishNotificationEventInput, db: TenantTransactionClient = this.prisma): Promise<NotificationEvent> {
    return (await this.publishOnce(input, db)).event
  }

  private async publishOnce(input: PublishNotificationEventInput, db: TenantTransactionClient): Promise<{ event: NotificationEvent; created: boolean }> {
    const data = {
      organizationId: input.organizationId, eventName: input.eventName,
      aggregateType: input.aggregateType, aggregateId: input.aggregateId,
      actorId: input.actorId ?? null, payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      idempotencyKey: input.idempotencyKey ?? null, occurredAt: input.occurredAt ?? new Date(),
    }
    if (!input.idempotencyKey) return { event: await db.notificationEvent.create({ data }), created: true }
    // ON CONFLICT avoids aborting the surrounding PostgreSQL transaction on a replay/race.
    const inserted = await db.notificationEvent.createMany({ data, skipDuplicates: true })
    const event = await db.notificationEvent.findFirstOrThrow({ where: {
      organizationId: input.organizationId, idempotencyKey: input.idempotencyKey,
    } })
    return { event, created: inserted.count === 1 }
  }

  async publishAndEvaluate(input: PublishNotificationEventInput) {
    const context = notificationTenantContext(input.organizationId, input.actorId ?? undefined)
    const published = await this.prisma.withTenantTransaction(context, tx => this.publishOnce(input, tx))
    const event = published.event
    if (!published.created) return { event, evaluation: null, duplicate: true }
    const evaluation = await this.prisma.withTenantTransaction(context, async tx => {
      const result = await this.ruleEngine.evaluateEvent(event, tx)
      if (this.escalations) await this.escalations.register(event, tx)
      return result
    })
    return { event, evaluation, duplicate: false }
  }

  /** A notification failure must not turn a committed domain action into an apparent failure. */
  async publishDomainEvent(input: PublishNotificationEventInput) {
    try { return await this.publishAndEvaluate(input) }
    catch (error) {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error)
      this.logger.error(`Notification event processing failed event=${input.eventName} aggregateId=${input.aggregateId} organizationId=${input.organizationId}`, detail)
      return null
    }
  }
}
