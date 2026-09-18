import { Injectable } from "@nestjs/common"
import { NotificationFailureCategory, NotificationTriggerType, type NotificationDeliveryStatus, type Prisma } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { notificationTenantContext } from "../in-app/notification-tenant-context"

type AttemptContext = { status: NotificationDeliveryStatus; attemptCount: number; retryRequestedById: string | null; event: { actorId: string | null; payload: Prisma.JsonValue } }

@Injectable()
export class NotificationDeliveryAuditService {
  constructor(private readonly prisma: PrismaService) {}
  async record(deliveryId: string, organizationId: string, before: AttemptContext, resultStatus: NotificationDeliveryStatus) {
    return this.prisma.withTenantTransaction(notificationTenantContext(organizationId), async tx => {
      const delivery = await tx.notificationDelivery.findFirst({ where: { id: deliveryId, organizationId }, select: { id: true, channel: true, attemptCount: true, lastAttemptAt: true, providerMessageId: true, failureCode: true, failureMessage: true } })
      if (!delivery?.lastAttemptAt || delivery.attemptCount < 1) return null
      const triggerType = this.triggerType(before)
      const triggeredByUserId = triggerType === NotificationTriggerType.MANUAL_RETRY ? before.retryRequestedById : triggerType === NotificationTriggerType.DOMAIN_EVENT ? before.event.actorId : null
      await tx.notificationDeliveryAttempt.createMany({ skipDuplicates: true, data: { organizationId, deliveryId, attemptNumber: delivery.attemptCount, triggerType, triggeredByUserId, status: resultStatus, provider: delivery.channel, providerMessageId: delivery.providerMessageId, failureCategory: delivery.failureCode ? this.failureCategory(delivery.failureCode) : null, failureCode: delivery.failureCode, failureReason: this.sanitize(delivery.failureMessage), startedAt: delivery.lastAttemptAt, finishedAt: new Date() } })
      await tx.notificationDelivery.updateMany({ where: { id: deliveryId, organizationId, retryRequestedById: before.retryRequestedById }, data: { retryRequestedAt: null, retryRequestedById: null } })
      return delivery.attemptCount
    })
  }
  private triggerType(value: AttemptContext) {
    if (value.retryRequestedById) return NotificationTriggerType.MANUAL_RETRY
    if (value.status === "RETRYING" || value.attemptCount > 0) return NotificationTriggerType.AUTOMATIC_RETRY
    const payload = value.event.payload && typeof value.event.payload === "object" && !Array.isArray(value.event.payload) ? value.event.payload as Record<string, unknown> : {}
    if (payload.schedule) return NotificationTriggerType.SCHEDULED
    if (value.event.actorId) return NotificationTriggerType.DOMAIN_EVENT
    return NotificationTriggerType.SYSTEM
  }
  failureCategory(code: string): NotificationFailureCategory {
    const value = code.toUpperCase()
    if (value.includes("TIMEOUT")) return NotificationFailureCategory.TIMEOUT
    if (value.includes("AUTH") || value.includes("401") || value.includes("403")) return NotificationFailureCategory.AUTHENTICATION
    if (value.includes("RATE") || value.includes("429")) return NotificationFailureCategory.RATE_LIMIT
    if (value.includes("DESTINATION") || value.includes("RECIPIENT") || value.includes("ENDPOINT")) return NotificationFailureCategory.INVALID_DESTINATION
    if (value.includes("TEMPLATE")) return NotificationFailureCategory.TEMPLATE_ERROR
    if (value.includes("CONFIG") || value.includes("NOT_CONFIGURED")) return NotificationFailureCategory.CONFIGURATION
    if (value.includes("NETWORK") || value.includes("DISPATCH") || /^HTTP_5/.test(value)) return NotificationFailureCategory.NETWORK
    if (value.includes("PROVIDER") || value.startsWith("HTTP_4")) return NotificationFailureCategory.PROVIDER_REJECTED
    return NotificationFailureCategory.UNKNOWN
  }
  sanitize(value: string | null) {
    if (!value) return null
    return value.slice(0, 1000).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]").replace(/(api[-_ ]?key|password|token|secret)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").replace(/([?&](?:key|token|secret|signature)=)[^&\s]+/gi, "$1[REDACTED]")
  }
}
