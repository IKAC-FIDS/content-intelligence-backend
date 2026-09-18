import { Injectable } from "@nestjs/common"
import { NotificationChannel, NotificationDeliveryStatus, NotificationPriority, NotificationQuietHoursMode, type NotificationEvent, type NotificationRule } from "@prisma/client"
import type { TenantTransactionClient } from "../../prisma/prisma.service"
import { dailyDigestWindow, quietHoursDecision } from "./notification-time-window"

export type OrchestrationDecision = {
  disposition: "DIRECT" | "SUPPRESSED_PREFERENCE" | "SUPPRESSED_QUIET_HOURS" | "DEFERRED_QUIET_HOURS" | "DIGESTED"
  status: NotificationDeliveryStatus
  nextAttemptAt: Date | null
  deferredUntil: Date | null
  digest?: { policyId: string; windowStart: Date; scheduledFor: Date } | null
}

@Injectable()
export class NotificationOrchestrationService {
  async decide(event: NotificationEvent, rule: Pick<NotificationRule, "mandatory" | "deliveryPriority" | "digestPolicyId">, recipientUserId: string, channel: NotificationChannel, db: TenantTransactionClient, now = new Date()): Promise<OrchestrationDecision> {
    const preference = await db.notificationPreference.findUnique({ where: { organizationId_userId_eventName_channel: { organizationId: event.organizationId, userId: recipientUserId, eventName: event.eventName, channel } }, select: { enabled: true } })
    if (!rule.mandatory && preference?.enabled === false) return { disposition: "SUPPRESSED_PREFERENCE", status: NotificationDeliveryStatus.SKIPPED, nextAttemptAt: null, deferredUntil: null }

    const critical = rule.deliveryPriority === NotificationPriority.CRITICAL
    let resumeAt: Date | null = null
    const quiet = await db.notificationQuietHoursPolicy.findUnique({ where: { organizationId: event.organizationId } })
    if (quiet?.enabled && quiet.channels.includes(channel)) {
      const window = quietHoursDecision(now, quiet.startTime, quiet.endTime, quiet.timezone)
      if (window.active && !(critical && quiet.allowCritical)) {
        if (quiet.mode === NotificationQuietHoursMode.SUPPRESS) return { disposition: "SUPPRESSED_QUIET_HOURS", status: NotificationDeliveryStatus.SKIPPED, nextAttemptAt: null, deferredUntil: null }
        resumeAt = window.resumeAt
      }
    }

    if (!critical && rule.digestPolicyId && channel === NotificationChannel.EMAIL) {
      const policy = await db.notificationDigestPolicy.findFirst({ where: { id: rule.digestPolicyId, organizationId: event.organizationId, enabled: true, eventNames: { has: event.eventName }, channels: { has: channel } } })
      if (policy) {
        const window = dailyDigestWindow(now, policy.sendTime, policy.timezone)
        const scheduledFor = resumeAt && resumeAt > window.scheduledFor ? resumeAt : window.scheduledFor
        return { disposition: "DIGESTED", status: NotificationDeliveryStatus.PENDING, nextAttemptAt: scheduledFor, deferredUntil: scheduledFor, digest: { policyId: policy.id, windowStart: window.windowStart, scheduledFor } }
      }
    }

    if (resumeAt) return { disposition: "DEFERRED_QUIET_HOURS", status: NotificationDeliveryStatus.PENDING, nextAttemptAt: resumeAt, deferredUntil: resumeAt }
    return { disposition: "DIRECT", status: NotificationDeliveryStatus.PENDING, nextAttemptAt: null, deferredUntil: null }
  }
}
