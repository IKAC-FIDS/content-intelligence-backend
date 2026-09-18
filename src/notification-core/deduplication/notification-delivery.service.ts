import { Injectable, Logger } from "@nestjs/common"
import { NotificationDeliveryStatus, Prisma, type NotificationChannel, type NotificationDelivery, type NotificationEvent } from "@prisma/client"
import type { TenantTransactionClient } from "../../prisma/prisma.service"
import { NotificationDeduplicationKeyService } from "./notification-deduplication-key.service"
import type { OrchestrationDecision } from "../orchestration/notification-orchestration.service"

export type CreatePendingDeliveryInput = {
  event: NotificationEvent
  ruleId?: string | null
  recipientRuleId?: string | null
  recipientUserId: string
  templateId?: string | null
  channel: NotificationChannel
  priority?: import("@prisma/client").NotificationPriority
  decision?: OrchestrationDecision
  escalationRunId?: string | null
}

export type DeliveryCreationResult =
  | { status: "CREATED"; delivery: NotificationDelivery }
  | { status: "DUPLICATE"; delivery: NotificationDelivery }

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name)
  constructor(private readonly identities: NotificationDeduplicationKeyService) {}

  async createPendingDelivery(input: CreatePendingDeliveryInput, db: TenantTransactionClient): Promise<DeliveryCreationResult> {
    const eventOccurrenceKey = this.identities.eventOccurrence(input.event)
    const deduplicationKey = this.identities.build({ organizationId: input.event.organizationId, eventOccurrenceKey, recipientUserId: input.recipientUserId, channel: input.channel })
    const data = {
      organizationId: input.event.organizationId,
      eventId: input.event.id,
      ruleId: input.ruleId ?? null,
      recipientRuleId: input.recipientRuleId ?? null,
      recipientUserId: input.recipientUserId,
      templateId: input.templateId ?? null,
      channel: input.channel,
      status: input.decision?.status ?? NotificationDeliveryStatus.PENDING,
      priority: input.priority,
      orchestrationReason: input.decision?.disposition ?? "DIRECT",
      nextAttemptAt: input.decision?.nextAttemptAt ?? null,
      deferredUntil: input.decision?.deferredUntil ?? null,
      escalationRunId: input.escalationRunId ?? null,
      deduplicationKey,
    }
    try {
      const inserted = await db.notificationDelivery.createMany({ data, skipDuplicates: true })
      const delivery = await db.notificationDelivery.findUniqueOrThrow({ where: { organizationId_deduplicationKey: { organizationId: input.event.organizationId, deduplicationKey } } })
      if (inserted.count === 1) {
        if (input.decision?.digest) await this.attachDigest(input, delivery.id, db)
        this.log("delivery.created", input, delivery.id)
        return { status: "CREATED", delivery }
      }
      this.log("delivery.duplicate_skipped", input, delivery.id)
      return { status: "DUPLICATE", delivery }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const delivery = await db.notificationDelivery.findUniqueOrThrow({ where: { organizationId_deduplicationKey: { organizationId: input.event.organizationId, deduplicationKey } } })
        this.log("delivery.unique_conflict", input, delivery.id)
        return { status: "DUPLICATE", delivery }
      }
      throw error
    }
  }

  private async attachDigest(input: CreatePendingDeliveryInput, deliveryId: string, db: TenantTransactionClient) {
    const digest = input.decision?.digest
    if (!digest) return
    const bucket = await db.notificationDigestBucket.upsert({
      where: { organizationId_policyId_recipientUserId_channel_windowStart: { organizationId: input.event.organizationId, policyId: digest.policyId, recipientUserId: input.recipientUserId, channel: input.channel, windowStart: digest.windowStart } },
      create: { organizationId: input.event.organizationId, policyId: digest.policyId, recipientUserId: input.recipientUserId, channel: input.channel, windowStart: digest.windowStart, scheduledFor: digest.scheduledFor, carrierDeliveryId: deliveryId },
      update: { scheduledFor: digest.scheduledFor },
      select: { id: true, carrierDeliveryId: true },
    })
    await db.notificationDigestItem.createMany({ data: [{ bucketId: bucket.id, deliveryId, eventId: input.event.id }], skipDuplicates: true })
    await db.notificationDelivery.update({ where: { id: deliveryId }, data: {
      digestBucketId: bucket.id,
      ...(bucket.carrierDeliveryId === deliveryId ? {} : { status: NotificationDeliveryStatus.SKIPPED, nextAttemptAt: null, deferredUntil: digest.scheduledFor, orchestrationReason: "DIGEST_ITEM" }),
    } })
  }

  private log(event: string, input: CreatePendingDeliveryInput, deliveryId: string) {
    this.logger.log(JSON.stringify({ event, organizationId: input.event.organizationId, eventName: input.event.eventName, recipientUserId: input.recipientUserId, channel: input.channel, deliveryId }))
  }
}
