import { BadRequestException, Injectable } from "@nestjs/common"
import { createHash } from "node:crypto"
import type { NotificationChannel, NotificationEvent } from "@prisma/client"

export type NotificationDeliveryIdentity = {
  organizationId: string
  eventOccurrenceKey: string
  recipientUserId: string
  channel: NotificationChannel
}

@Injectable()
export class NotificationDeduplicationKeyService {
  readonly version = "v1"

  eventOccurrence(event: Pick<NotificationEvent, "idempotencyKey">) {
    const identity = event.idempotencyKey?.trim()
    if (!identity) throw new BadRequestException("Notification event occurrence identity is required")
    return identity
  }

  build(input: NotificationDeliveryIdentity) {
    const organizationId = this.required(input.organizationId, "organizationId")
    const eventOccurrenceKey = this.required(input.eventOccurrenceKey, "eventOccurrenceKey")
    const recipientUserId = this.required(input.recipientUserId, "recipientUserId")
    const channel = this.required(String(input.channel).toUpperCase(), "channel")
    const canonical = JSON.stringify([this.version, organizationId, eventOccurrenceKey, recipientUserId, channel])
    return createHash("sha256").update(canonical, "utf8").digest("hex")
  }

  private required(value: string | null | undefined, field: string) {
    const normalized = value?.trim()
    if (!normalized) throw new BadRequestException(`Notification delivery identity ${field} is required`)
    return normalized
  }
}
