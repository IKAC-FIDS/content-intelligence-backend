import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { NotificationChannel, NotificationDeliveryStatus as Status } from "@prisma/client"
import { EmailService } from "../../email/email.service"
import { PrismaService } from "../../prisma/prisma.service"
import type { NotificationChannelHandler, NotificationDispatchResult } from "../notification-channel-handler"
import { NotificationTemplateEngineService } from "../notification-template-engine.service"
import { notificationTenantContext } from "../in-app/notification-tenant-context"
import { NotificationDigestRendererService } from "../orchestration/notification-digest-renderer.service"

@Injectable()
export class EmailNotificationChannelHandler implements NotificationChannelHandler {
  readonly channel = NotificationChannel.EMAIL
  private readonly logger = new Logger(EmailNotificationChannelHandler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: NotificationTemplateEngineService,
    private readonly email: EmailService,
    private readonly digests: NotificationDigestRendererService,
  ) {}

  async dispatch(deliveryId: string, organizationId?: string): Promise<NotificationDispatchResult> {
    if (!organizationId) throw new BadRequestException("Organization context is required")
    const context = notificationTenantContext(organizationId)
    const where = { id: deliveryId, channel: this.channel, event: { organizationId } }

    const prepared = await this.prisma.withTenantTransaction(context, async (tx) => {
      const claim = await tx.notificationDelivery.updateMany({
        where: { ...where, status: { in: [Status.PENDING, Status.RETRYING, Status.FAILED] } },
        data: { status: Status.PROCESSING, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), processingStartedAt: new Date(), nextAttemptAt: null },
      })
      const delivery = await tx.notificationDelivery.findFirst({
        where,
        include: {
          event: true,
          template: true,
          recipientUser: { select: { id: true, email: true, isActive: true } },
        },
      })
      if (!delivery) throw new NotFoundException("Notification delivery not found")
      if (!claim.count) return { delivery, rendered: null, destination: null, claimable: false }
      if (delivery.digestBucketId) await tx.notificationDigestBucket.update({ where: { id: delivery.digestBucketId }, data: { status: "PROCESSING" } })
      const destination = delivery.destination?.trim().toLowerCase() || delivery.recipientUser?.email?.trim().toLowerCase() || null
      if (!delivery.recipientUser?.isActive || !destination || !this.validEmail(destination) || !delivery.template) {
        return { delivery, rendered: null, destination, claimable: true }
      }
      const rendered = delivery.digestBucketId
        ? await this.digests.render(delivery.digestBucketId, delivery.recipientUser.id, tx)
        : await this.templates.renderStoredTemplate(delivery.event, delivery.recipientUser.id, delivery.template, tx)
      return { delivery, rendered, destination, claimable: true }
    })

    if (!prepared.claimable) {
      return { deliveryId, status: prepared.delivery.status, sent: false, reason: "DELIVERY_NOT_CLAIMABLE" }
    }
    if (!prepared.destination) return this.skip(deliveryId, organizationId, "MISSING_EMAIL_DESTINATION", "ایمیل معتبر برای گیرنده یافت نشد")
    if (!prepared.rendered || !prepared.rendered.subject?.trim()) return this.skip(deliveryId, organizationId, "INVALID_EMAIL_TEMPLATE", "موضوع یا قالب ایمیل معتبر نیست")
    try {
      const result = await this.email.send(organizationId, {
        to: prepared.destination,
        subject: prepared.rendered.subject,
        text: prepared.rendered.body,
      })
      const now = new Date()
      await this.prisma.withTenantTransaction(context, (tx) => tx.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: Status.SENT,
          destination: prepared.destination,
          providerMessageId: result.messageId ?? null,
          sentAt: now,
          failureCode: null,
          failureMessage: null,
          processingStartedAt: null,
        },
      }))
      if (prepared.delivery.digestBucketId) await this.prisma.withTenantTransaction(context, tx => tx.notificationDigestBucket.update({ where: { id: prepared.delivery.digestBucketId! }, data: { status: "SENT" } }))
      return { deliveryId, status: Status.SENT, sent: true }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "ارسال ایمیل ناموفق بود"
      await this.prisma.withTenantTransaction(context, (tx) => tx.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: Status.FAILED, destination: prepared.destination, failureCode: "EMAIL_DISPATCH_ERROR", failureMessage: message, processingStartedAt: null },
      }))
      if (prepared.delivery.digestBucketId) await this.prisma.withTenantTransaction(context, tx => tx.notificationDigestBucket.update({ where: { id: prepared.delivery.digestBucketId! }, data: { status: "FAILED" } }))
      this.logger.warn(`EMAIL dispatch failed deliveryId=${deliveryId} organizationId=${organizationId}`)
      return { deliveryId, status: Status.FAILED, sent: false, reason: "EMAIL_DISPATCH_ERROR" }
    }
  }

  private async skip(deliveryId: string, organizationId: string, code: string, message: string) {
    await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), (tx) =>
      tx.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: Status.SKIPPED, failureCode: code, failureMessage: message, processingStartedAt: null, nextAttemptAt: null },
      }),
    )
    return { deliveryId, status: Status.SKIPPED, sent: false, reason: code }
  }

  private validEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }
}
