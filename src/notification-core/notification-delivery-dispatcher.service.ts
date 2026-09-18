import { BadRequestException, Injectable, Logger } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import type { NotificationChannelHandler } from "./notification-channel-handler"
import { SmsNotificationChannelHandler } from "./sms/sms-notification-channel.handler"
import { InAppNotificationChannelHandler } from './in-app/in-app-notification-channel.handler'
import { EmailNotificationChannelHandler } from './email/email-notification-channel.handler'
import { PushNotificationChannelHandler } from './push/push-notification-channel.handler'
import { notificationTenantContext } from './in-app/notification-tenant-context'
import { NotificationDeliveryQueueService } from './queue/notification-delivery-queue.service'
import { NotificationDeliveryAuditService } from './audit/notification-delivery-audit.service'
import type { NotificationDeliveryStatus } from '@prisma/client'

@Injectable()
export class NotificationDeliveryDispatcher {
  private readonly logger = new Logger(NotificationDeliveryDispatcher.name)
  private readonly handlers: Map<string, NotificationChannelHandler>
  constructor(private readonly prisma: PrismaService, private readonly queue: NotificationDeliveryQueueService, private readonly audit: NotificationDeliveryAuditService, sms: SmsNotificationChannelHandler, inApp: InAppNotificationChannelHandler, email: EmailNotificationChannelHandler, push: PushNotificationChannelHandler) {
    this.handlers = new Map<string, NotificationChannelHandler>([[sms.channel, sms], [inApp.channel, inApp], [email.channel, email], [push.channel, push]])
  }
  async dispatch(deliveryId: string, organizationId: string) {
    const delivery = await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.notificationDelivery.findFirst({ where: { id: deliveryId, organizationId }, select: { id: true, channel: true, status: true, attemptCount: true, retryRequestedById: true, event: { select: { actorId: true, payload: true } } } }))
    if (!delivery) throw new BadRequestException("Delivery در سازمان جاری یافت نشد")
    const handler = this.handlers.get(delivery.channel)
    if (!handler) throw new BadRequestException(`کانال ${delivery.channel} هنوز dispatcher ندارد`)
    try {
      const result = await handler.dispatch(delivery.id, organizationId)
      if (result.reason !== "DELIVERY_NOT_CLAIMABLE") await this.recordAudit(delivery.id, organizationId, delivery, result.status as NotificationDeliveryStatus)
      if (result.status === "FAILED") await this.queue.handleFailure(delivery.id, organizationId, result.reason)
      return result
    } catch (error) {
      await this.recordAudit(delivery.id, organizationId, delivery, "FAILED")
      await this.queue.handleFailure(delivery.id, organizationId, error instanceof Error ? error.message : "DISPATCH_ERROR")
      throw error
    }
  }
  private async recordAudit(deliveryId: string, organizationId: string, delivery: Parameters<NotificationDeliveryAuditService["record"]>[2], status: NotificationDeliveryStatus) {
    try { await this.audit.record(deliveryId, organizationId, delivery, status) }
    catch (error) { this.logger.error(`ثبت تاریخچه تلاش اعلان ${deliveryId} ناموفق بود`, error instanceof Error ? error.stack : String(error)) }
  }
}
