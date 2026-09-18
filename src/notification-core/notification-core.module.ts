import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { NotificationCoreService } from "./notification-core.service"
import { NotificationRuleEngineService } from "./notification-rule-engine.service"
import { NotificationRulesController } from "./notification-rules.controller"
import { NotificationRulesService } from "./notification-rules.service"
import { NotificationAdminController, NotificationDeliveriesController, NotificationTemplatesController } from "./notification-admin.controller"
import { NotificationAdminService } from "./notification-admin.service"
import { NotificationTemplateEngineService } from "./notification-template-engine.service"
import { SsoModule } from "../auth/sso/sso.module"
import { AuditLogModule } from "../audit-log/audit-log.module"
import { GenericHttpSmsProvider } from "./sms/generic-http-sms.provider"
import { SmsProviderRegistry } from "./sms/sms-provider.registry"
import { SmsRecipientResolver } from "./sms/sms-recipient-resolver.service"
import { SmsSettingsService } from "./sms/sms-settings.service"
import { SmsNotificationChannelHandler } from "./sms/sms-notification-channel.handler"
import { NotificationDeliveryDispatcher } from "./notification-delivery-dispatcher.service"
import { SmsAdminController } from "./sms/sms-admin.controller"
import { NotificationsModule } from '../notifications/notifications.module'
import { InAppNotificationChannelHandler } from './in-app/in-app-notification-channel.handler'
import { InAppNotificationMetadataMapper, NotificationActionUrlResolver } from './in-app/notification-action-url.resolver'
import { EmailModule } from '../email/email.module'
import { EmailNotificationChannelHandler } from './email/email-notification-channel.handler'
import { PushAdminController, PushSubscriptionController } from './push/push.controller'
import { PushNotificationChannelHandler } from './push/push-notification-channel.handler'
import { PushProviderRegistry } from './push/push-provider.registry'
import { PushSettingsService } from './push/push-settings.service'
import { WebPushProvider } from './push/web-push.provider'
import { NotificationPolicyConditionValidator } from './policy/notification-policy-condition-validator.service'
import { NotificationPolicyContextBuilder } from './policy/notification-policy-context-builder.service'
import { NotificationPolicyEvaluatorService } from './policy/notification-policy-evaluator.service'
import { NotificationScheduleValidator } from './schedule/notification-schedule-validator.service'
import { NotificationSchedulerService } from './schedule/notification-scheduler.service'
import { NotificationDeliveryQueueService } from './queue/notification-delivery-queue.service'
import { NotificationDeliveryWorkerService } from './queue/notification-delivery-worker.service'
import { NotificationDeduplicationKeyService } from './deduplication/notification-deduplication-key.service'
import { NotificationDeliveryService } from './deduplication/notification-delivery.service'
import { NotificationDeliveryAuditService } from './audit/notification-delivery-audit.service'
import { NotificationPolicyAdminController } from './orchestration/notification-policy-admin.controller'
import { NotificationPolicyAdminService } from './orchestration/notification-policy-admin.service'
import { NotificationOrchestrationService } from './orchestration/notification-orchestration.service'
import { NotificationDigestRendererService } from './orchestration/notification-digest-renderer.service'
import { NotificationEscalationService } from './orchestration/notification-escalation.service'

@Module({
  imports: [PrismaModule, SsoModule, AuditLogModule, NotificationsModule, EmailModule],
  controllers: [NotificationRulesController, NotificationAdminController, NotificationTemplatesController, NotificationDeliveriesController, SmsAdminController, PushAdminController, PushSubscriptionController, NotificationPolicyAdminController],
  providers: [NotificationPolicyAdminService, NotificationOrchestrationService, NotificationDigestRendererService, NotificationEscalationService, NotificationDeliveryAuditService, NotificationDeduplicationKeyService, NotificationDeliveryService, NotificationDeliveryQueueService, NotificationDeliveryWorkerService, NotificationScheduleValidator, NotificationSchedulerService, NotificationPolicyConditionValidator, NotificationPolicyContextBuilder, NotificationPolicyEvaluatorService, PushNotificationChannelHandler, PushProviderRegistry, PushSettingsService, WebPushProvider, EmailNotificationChannelHandler, InAppNotificationChannelHandler, InAppNotificationMetadataMapper, NotificationActionUrlResolver, NotificationCoreService, NotificationRulesService, NotificationRuleEngineService, NotificationAdminService, NotificationTemplateEngineService, GenericHttpSmsProvider, SmsProviderRegistry, SmsRecipientResolver, SmsSettingsService, SmsNotificationChannelHandler, NotificationDeliveryDispatcher],
  exports: [NotificationCoreService, NotificationRulesService, NotificationRuleEngineService, NotificationTemplateEngineService, NotificationDeliveryDispatcher],
})
export class NotificationCoreModule {}
