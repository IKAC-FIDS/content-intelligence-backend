import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { NotificationChannel, NotificationDeliveryStatus } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import type { NotificationChannelHandler, NotificationDispatchResult } from "../notification-channel-handler"
import { NotificationTemplateEngineService } from "../notification-template-engine.service"
import { SmsRecipientResolver } from "./sms-recipient-resolver.service"
import { SmsSettingsService } from "./sms-settings.service"
import { notificationTenantContext } from "../in-app/notification-tenant-context"

@Injectable()
export class SmsNotificationChannelHandler implements NotificationChannelHandler {
  readonly channel = NotificationChannel.SMS
  private readonly logger = new Logger(SmsNotificationChannelHandler.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: NotificationTemplateEngineService,
    private readonly contacts: SmsRecipientResolver,
    private readonly settings: SmsSettingsService,
  ) {}

  async dispatch(deliveryId: string, organizationId?: string): Promise<NotificationDispatchResult> {
    if (!organizationId) throw new BadRequestException("Organization context is required")
    const context = notificationTenantContext(organizationId)
    const where = { id: deliveryId, channel: NotificationChannel.SMS, event: { organizationId } }
    const claimed = await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.updateMany({
      where: { ...where, status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.RETRYING] } },
      data: { status: NotificationDeliveryStatus.PROCESSING, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), processingStartedAt: new Date(), nextAttemptAt: null },
    }))
    if (claimed.count !== 1) {
      const existing = await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.findFirst({ where, select: { status: true, channel: true } }))
      if (!existing) throw new NotFoundException("Notification delivery not found")
      return { deliveryId, status: existing.status, sent: false, reason: "DELIVERY_NOT_CLAIMABLE" }
    }
    const delivery = await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.findFirst({
      where,
      include: { event: true, template: true, recipientUser: { select: { id: true } } },
    }))
    if (!delivery?.recipientUser || !delivery.template) return this.skip(deliveryId, organizationId, "INCOMPLETE_DELIVERY", "گیرنده یا قالب پیامک موجود نیست")
    const destination = delivery.destination || await this.contacts.resolve(delivery.event.organizationId, delivery.recipientUser.id)
    if (!destination) return this.skip(deliveryId, organizationId, "MISSING_SMS_DESTINATION", "شماره موبایل معتبر برای گیرنده یافت نشد")
    try {
      const rendered = await this.templates.renderStoredTemplate(delivery.event, delivery.recipientUser.id, delivery.template)
      const { provider, config } = await this.settings.configured(delivery.event.organizationId)
      const result = await provider.send(config, { to: destination, message: rendered.body, sender: config.senderNumber, idempotencyKey: delivery.deduplicationKey })
      if (!result.success) {
        await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.update({ where: { id: deliveryId }, data: { status: NotificationDeliveryStatus.FAILED, destination, failureCode: result.errorCode ?? "SMS_PROVIDER_FAILED", failureMessage: result.errorMessage?.slice(0, 1000) ?? "ارسال پیامک ناموفق بود", processingStartedAt: null } }))
        this.logger.warn(`SMS failed deliveryId=${deliveryId} organizationId=${delivery.event.organizationId} provider=${provider.code} destination=${this.contacts.mask(destination)} code=${result.errorCode ?? "unknown"}`)
        return { deliveryId, status: NotificationDeliveryStatus.FAILED, sent: false, reason: result.errorCode ?? "SMS_PROVIDER_FAILED" }
      }
      await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.update({ where: { id: deliveryId }, data: { status: NotificationDeliveryStatus.SENT, destination, providerMessageId: result.providerMessageId ?? null, failureCode: null, failureMessage: null, sentAt: new Date(), processingStartedAt: null } }))
      this.logger.log(`SMS sent deliveryId=${deliveryId} organizationId=${delivery.event.organizationId} provider=${provider.code} destination=${this.contacts.mask(destination)} providerMessageId=${result.providerMessageId ?? "none"}`)
      return { deliveryId, status: NotificationDeliveryStatus.SENT, sent: true }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "ارسال پیامک ناموفق بود"
      await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.update({ where: { id: deliveryId }, data: { status: NotificationDeliveryStatus.FAILED, destination, failureCode: "SMS_DISPATCH_ERROR", failureMessage: message, processingStartedAt: null } }))
      return { deliveryId, status: NotificationDeliveryStatus.FAILED, sent: false, reason: "SMS_DISPATCH_ERROR" }
    }
  }

  private async skip(deliveryId: string, organizationId: string, code: string, message: string) {
    await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.notificationDelivery.update({ where: { id: deliveryId }, data: { status: NotificationDeliveryStatus.SKIPPED, failureCode: code, failureMessage: message, processingStartedAt: null, nextAttemptAt: null } }))
    return { deliveryId, status: NotificationDeliveryStatus.SKIPPED, sent: false, reason: code }
  }
}
