import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus as Status } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationTemplateEngineService } from '../notification-template-engine.service';
import type { NotificationChannelHandler, NotificationDispatchResult } from '../notification-channel-handler';
import { InAppNotificationMetadataMapper, NotificationActionUrlResolver } from './notification-action-url.resolver';
import { notificationTenantContext } from './notification-tenant-context';

@Injectable()
export class InAppNotificationChannelHandler implements NotificationChannelHandler {
  readonly channel = NotificationChannel.IN_APP;
  private readonly logger = new Logger(InAppNotificationChannelHandler.name);
  constructor(private readonly prisma: PrismaService, private readonly templates: NotificationTemplateEngineService,
    private readonly notifications: NotificationsService, private readonly urls: NotificationActionUrlResolver,
    private readonly metadata: InAppNotificationMetadataMapper) {}

  async dispatch(deliveryId: string, organizationId?: string): Promise<NotificationDispatchResult> {
    if (!organizationId) throw new BadRequestException('Organization context is required');
    const context = notificationTenantContext(organizationId);
    const where = { id: deliveryId, channel: this.channel, event: { organizationId } };
    try {
      return await this.prisma.withTenantTransaction(context, async tx => {
        const claim = await tx.notificationDelivery.updateMany({ where: { ...where, status: { in: [Status.PENDING, Status.RETRYING, Status.FAILED] } },
          data: { status: Status.PROCESSING, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), processingStartedAt: new Date(), nextAttemptAt: null } });
        const delivery = await tx.notificationDelivery.findFirst({ where, include: { event: true, template: true } });
        if (!delivery) throw new NotFoundException('Notification delivery not found');
        if (!claim.count) return { deliveryId, status: delivery.status, sent: false, reason: 'DELIVERY_NOT_CLAIMABLE' };
        const skip = async (code: string) => {
          await tx.notificationDelivery.update({ where: { id: deliveryId }, data: { status: Status.SKIPPED, failureCode: code, failureMessage: code, processingStartedAt: null, nextAttemptAt: null } });
          return { deliveryId, status: Status.SKIPPED, sent: false, reason: code };
        };
        if (!delivery.recipientUserId) return skip('RECIPIENT_NOT_FOUND');
        const recipient = await tx.user.findFirst({ where: { id: delivery.recipientUserId, isActive: true,
          organizationMemberships: { some: { organizationId, status: 'ACTIVE' } } }, select: { id: true } });
        if (!recipient) return skip('RECIPIENT_NOT_FOUND');
        const template = delivery.template;
        if (!template || template.channel !== this.channel || !template.isActive || template.organizationId !== organizationId || template.eventName !== delivery.event.eventName) return skip('IN_APP_TEMPLATE_NOT_FOUND');
        this.templates.validate(delivery.event.eventName, template.subject, template.body);
        const rendered = await this.templates.renderStoredTemplate(delivery.event, recipient.id, template, tx);
        if (!rendered.subject?.trim()) return skip('INVALID_TEMPLATE_CONTEXT');
        const actionUrl = this.urls.resolve(delivery.event);
        if (!actionUrl) return skip('INVALID_ACTION_URL');
        const actor = delivery.event.actorId ? await tx.user.findFirst({ where: { id: delivery.event.actorId,
          organizationMemberships: { some: { organizationId, status: 'ACTIVE' } } }, select: { id: true } }) : null;
        const notification = await this.notifications.createInternal({
          organizationId, recipientId: recipient.id, actorId: actor?.id, title: rendered.subject, body: rendered.body,
          ...this.metadata.map(delivery.event), actionUrl,
          metadata: { source: 'NOTIFICATION_CORE', eventId: delivery.eventId, deliveryId, deduplicationKey: delivery.deduplicationKey },
        }, tx);
        if (!notification) return skip('RECIPIENT_NOT_FOUND');
        const now = new Date();
        await tx.notificationDelivery.update({ where: { id: deliveryId }, data: {
          status: Status.DELIVERED, sentAt: now, deliveredAt: now, providerMessageId: notification.id,
          destination: recipient.id, failureCode: null, failureMessage: null, processingStartedAt: null,
        } });
        return { deliveryId, status: Status.DELIVERED, sent: true };
      }, { timeout: 15000 });
    } catch {
      // The transaction rolled back BOTH the inbox insertion and claim. Never overwrite a concurrent success.
      await this.prisma.withTenantTransaction(context, tx => tx.notificationDelivery.updateMany({
        where: { ...where, status: { in: [Status.PENDING, Status.RETRYING, Status.FAILED] } },
        data: { status: Status.FAILED, failureCode: 'IN_APP_DISPATCH_ERROR', failureMessage: 'ایجاد اعلان داخل سامانه ناموفق بود', attemptCount: { increment: 1 }, lastAttemptAt: new Date(), processingStartedAt: null },
      }));
      this.logger.warn(`IN_APP dispatch failed deliveryId=${deliveryId} organizationId=${organizationId}`);
      return { deliveryId, status: Status.FAILED, sent: false, reason: 'IN_APP_DISPATCH_ERROR' };
    }
  }
}
