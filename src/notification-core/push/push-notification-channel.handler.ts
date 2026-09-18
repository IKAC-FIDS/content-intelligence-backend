import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { NotificationChannel, NotificationDeliveryStatus as Status } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import type { NotificationChannelHandler, NotificationDispatchResult } from "../notification-channel-handler"
import { NotificationActionUrlResolver } from "../in-app/notification-action-url.resolver"
import { notificationTenantContext } from "../in-app/notification-tenant-context"
import { NotificationTemplateEngineService } from "../notification-template-engine.service"
import { PushSettingsService } from "./push-settings.service"

@Injectable()
export class PushNotificationChannelHandler implements NotificationChannelHandler {
  readonly channel = NotificationChannel.PUSH
  private readonly logger = new Logger(PushNotificationChannelHandler.name)
  constructor(private readonly prisma: PrismaService, private readonly templates: NotificationTemplateEngineService, private readonly urls: NotificationActionUrlResolver, private readonly push: PushSettingsService) {}

  async dispatch(deliveryId: string, organizationId?: string): Promise<NotificationDispatchResult> {
    if (!organizationId) throw new BadRequestException("Organization context is required")
    const context = notificationTenantContext(organizationId)
    const where = { id: deliveryId, channel: this.channel, event: { organizationId } }
    const prepared = await this.prisma.withTenantTransaction(context, async tx => {
      const claim = await tx.notificationDelivery.updateMany({ where: { ...where, status: { in: [Status.PENDING, Status.RETRYING, Status.FAILED] } }, data: { status: Status.PROCESSING, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), processingStartedAt: new Date(), nextAttemptAt: null } })
      const delivery = await tx.notificationDelivery.findFirst({ where, include: { event: true, template: true } })
      if (!delivery) throw new NotFoundException("Notification delivery not found")
      if (!claim.count) return { delivery, rendered: null, endpoints: [], claimable: false }
      if (!delivery.recipientUserId || !delivery.template) return { delivery, rendered: null, endpoints: [], claimable: true }
      const endpoints = await this.push.endpoints(context, delivery.recipientUserId, tx)
      const rendered = await this.templates.renderStoredTemplate(delivery.event, delivery.recipientUserId, delivery.template, tx)
      return { delivery, rendered, endpoints, claimable: true }
    })
    if (!prepared.claimable) return { deliveryId, status: prepared.delivery.status, sent: false, reason: "DELIVERY_NOT_CLAIMABLE" }
    if (!prepared.delivery.recipientUserId) return this.finish(context, deliveryId, Status.SKIPPED, "RECIPIENT_NOT_FOUND", "گیرنده اعلان پوش یافت نشد")
    if (!prepared.rendered?.subject?.trim()) return this.finish(context, deliveryId, Status.SKIPPED, "INVALID_PUSH_TEMPLATE", "عنوان قالب پوش معتبر نیست")
    if (!prepared.endpoints.length) return this.finish(context, deliveryId, Status.SKIPPED, "NO_PUSH_ENDPOINT", "گیرنده دستگاه فعال برای اعلان پوش ندارد")
    const actionUrl = this.urls.resolve(prepared.delivery.event)
    if (!actionUrl) return this.finish(context, deliveryId, Status.SKIPPED, "INVALID_ACTION_URL", "مسیر داخلی اعلان معتبر نیست")
    let providerData: Awaited<ReturnType<PushSettingsService["configured"]>>
    try { providerData = await this.push.configured(context) }
    catch (error) { return this.finish(context, deliveryId, Status.FAILED, "PUSH_NOT_CONFIGURED", error instanceof Error ? error.message : "کانال پوش پیکربندی نشده است") }
    const results = await Promise.all(prepared.endpoints.map(async endpoint => {
      try {
        return await providerData.provider.send({ recipientUserId: prepared.delivery.recipientUserId!, endpointId: endpoint.id, subscription: this.push.decodeEndpoint(endpoint.endpointEnc), title: prepared.rendered!.subject!, body: prepared.rendered!.body, actionUrl, data: { eventId: prepared.delivery.eventId, aggregateType: prepared.delivery.event.aggregateType, aggregateId: prepared.delivery.event.aggregateId }, idempotencyKey: `${prepared.delivery.deduplicationKey}:${endpoint.id}` }, providerData.config)
      } catch {
        this.logger.warn(`PUSH endpoint failed deliveryId=${deliveryId} endpointId=${endpoint.id}`)
        return { success: false, invalidEndpoint: false, errorCode: "PUSH_ENDPOINT_FAILED", errorMessage: "ارسال به مقصد پوش ناموفق بود" }
      }
    }))
    const invalidIds = prepared.endpoints.filter((_, index) => results[index]?.invalidEndpoint).map(item => item.id)
    if (invalidIds.length) await this.prisma.withTenantTransaction(context, tx => this.push.deactivate(context, invalidIds, tx))
    const successes = results.filter(item => item.success)
    const status = successes.length ? Status.SENT : Status.FAILED
    const failureCode = successes.length ? null : results[0]?.errorCode ?? "PUSH_PROVIDER_FAILED"
    const failureMessage = successes.length ? (successes.length < results.length ? `${successes.length} از ${results.length} مقصد دریافت کردند` : null) : results[0]?.errorMessage ?? "ارسال اعلان پوش ناموفق بود"
    await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.update({ where: { id: deliveryId }, data: { status, destination: `${successes.length}/${results.length} endpoints`, providerMessageId: successes.map(item => item.providerMessageId).filter(Boolean).join(",").slice(0, 1000) || null, sentAt: successes.length ? new Date() : null, failureCode, failureMessage, processingStartedAt: null } }))
    this.logger.log(`PUSH processed deliveryId=${deliveryId} organizationId=${organizationId} successful=${successes.length} attempted=${results.length}`)
    return { deliveryId, status, sent: successes.length > 0, reason: failureCode ?? undefined }
  }

  private async finish(context: ReturnType<typeof notificationTenantContext>, id: string, status: Status, code: string, message: string) {
    await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.update({ where: { id }, data: { status, failureCode: code, failureMessage: message, processingStartedAt: null, nextAttemptAt: null } }))
    return { deliveryId: id, status, sent: false, reason: code }
  }
}
