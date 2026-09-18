import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { NotificationChannel, NotificationTriggerType, type Prisma } from "@prisma/client"
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator"
import { createPaginationMeta } from "../common/pagination/pagination.util"
import { tenantScope } from "../common/tenant/tenant-scope.util"
import { PrismaService } from "../prisma/prisma.service"
import { NOTIFICATION_EVENT_CATALOG } from "./notification-core.catalog"
import type {
  CreateNotificationTemplateDto,
  NotificationDeliveryQueryDto,
  NotificationTemplateQueryDto,
  PreviewNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from "./dto/notification-admin.dto"
import { NotificationTemplateEngineService } from "./notification-template-engine.service"
import { SmsSettingsService } from "./sms/sms-settings.service"
import { PushSettingsService } from "./push/push-settings.service"

const events = Object.entries(NOTIFICATION_EVENT_CATALOG).flatMap(([service, actions]) =>
  Object.entries(actions).map(([action, eventName]) => ({ eventName, service, action })),
)
const allowedEvents = new Set<string>(events.map((item) => item.eventName))

@Injectable()
export class NotificationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: NotificationTemplateEngineService,
    private readonly smsSettings: SmsSettingsService,
    private readonly pushSettings: PushSettingsService,
  ) {}

  catalog() {
    return { events }
  }

  listTemplates(query: NotificationTemplateQueryDto, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const { organizationId } = context
    return this.prisma.withTenantTransaction(context, (tx) => tx.notificationTemplate.findMany({
      where: {
        organizationId,
        ...(query.eventName ? { eventName: query.eventName } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.locale ? { locale: query.locale } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search?.trim()
          ? { OR: [{ subject: { contains: query.search.trim(), mode: "insensitive" } }, { body: { contains: query.search.trim(), mode: "insensitive" } }] }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { version: "desc" }],
    }))
  }

  async getTemplate(id: string, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const { organizationId } = context
    const item = await this.prisma.withTenantTransaction(context, (tx) =>
      tx.notificationTemplate.findFirst({ where: { id, organizationId } }),
    )
    if (!item) throw new NotFoundException("Notification template not found")
    return item
  }

  async createTemplate(dto: CreateNotificationTemplateDto, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const { organizationId } = context
    this.assertEvent(dto.eventName)
    const locale = dto.locale?.trim() || "fa-IR"
    const subject = dto.channel === NotificationChannel.SMS ? null : dto.subject?.trim() || null
    const body = dto.body.trim()
    this.requireInAppSubject(dto.channel, subject)
    this.templateEngine.validate(dto.eventName, subject, body)
    return this.prisma.withTenantTransaction(context, async (tx) => {
      const latest = await tx.notificationTemplate.findFirst({
        where: { organizationId, eventName: dto.eventName, channel: dto.channel, locale },
        orderBy: { version: "desc" },
        select: { version: true },
      })
      const isActive = dto.isActive ?? true
      if (isActive) {
        await tx.notificationTemplate.updateMany({
          where: { organizationId, eventName: dto.eventName, channel: dto.channel, locale, isActive: true },
          data: { isActive: false },
        })
      }
      return tx.notificationTemplate.create({ data: {
        organizationId, eventName: dto.eventName, channel: dto.channel, locale,
        subject, body, isActive, version: (latest?.version ?? 0) + 1,
      } })
    })
  }

  async updateTemplate(id: string, dto: UpdateNotificationTemplateDto, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const previous = await this.getTemplate(id, user)
    if (dto.eventName) this.assertEvent(dto.eventName)
    const eventName = dto.eventName ?? previous.eventName
    const channel = dto.channel ?? previous.channel
    const locale = dto.locale?.trim() || previous.locale
    const subject = channel === NotificationChannel.SMS
      ? null
      : dto.subject !== undefined ? dto.subject?.trim() || null : previous.subject
    const body = dto.body?.trim() ?? previous.body
    this.requireInAppSubject(channel, subject)
    this.templateEngine.validate(eventName, subject, body)
    return this.prisma.withTenantTransaction(context, async (tx) => {
      const latest = await tx.notificationTemplate.findFirst({
        where: { organizationId: previous.organizationId, eventName, channel, locale },
        orderBy: { version: "desc" },
        select: { version: true },
      })
      const isActive = dto.isActive ?? true
      if (isActive) {
        await tx.notificationTemplate.updateMany({
          where: { organizationId: previous.organizationId, eventName, channel, locale, isActive: true },
          data: { isActive: false },
        })
      }
      return tx.notificationTemplate.create({ data: {
        organizationId: previous.organizationId, eventName, channel, locale,
        subject, body, isActive, version: (latest?.version ?? 0) + 1,
      } })
    })
  }

  async removeTemplate(id: string, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const { organizationId } = context
    const updated = await this.prisma.withTenantTransaction(context, (tx) =>
      tx.notificationTemplate.updateMany({ where: { id, organizationId }, data: { isActive: false } }),
    )
    if (!updated.count) throw new NotFoundException("Notification template not found")
    return { deleted: false, deactivated: true }
  }

  templateVariables(eventName: string) {
    this.assertEvent(eventName)
    return { eventName, variables: this.templateEngine.variables(eventName) }
  }

  previewTemplate(dto: PreviewNotificationTemplateDto) {
    this.assertEvent(dto.eventName)
    const subject = dto.channel === NotificationChannel.SMS ? null : dto.subject
    return {
      eventName: dto.eventName,
      channel: dto.channel,
      locale: dto.locale?.trim() || "fa-IR",
      ...this.templateEngine.preview(dto.eventName, subject, dto.body),
    }
  }

  async activateTemplate(id: string, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const template = await this.getTemplate(id, user)
    this.requireInAppSubject(template.channel, template.subject)
    return this.prisma.withTenantTransaction(context, async (tx) => {
      await tx.notificationTemplate.updateMany({
        where: {
          organizationId: template.organizationId,
          eventName: template.eventName,
          channel: template.channel,
          locale: template.locale,
          isActive: true,
        },
        data: { isActive: false },
      })
      return tx.notificationTemplate.update({ where: { id: template.id }, data: { isActive: true } })
    })
  }

  async listDeliveries(query: NotificationDeliveryQueryDto, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const { organizationId } = context
    const page = query.page || 1, limit = query.pageSize || 20
    const createdAt: Prisma.DateTimeFilter = {}
    if (query.dateFrom) createdAt.gte = this.date(query.dateFrom, "dateFrom")
    if (query.dateTo) createdAt.lte = this.date(query.dateTo, "dateTo")
    const where: Prisma.NotificationDeliveryWhereInput = {
      organizationId,
      event: {
        organizationId,
        ...(query.eventName ? { eventName: query.eventName } : {}),
        ...(query.aggregateType ? { aggregateType: query.aggregateType } : {}),
        ...(query.aggregateId ? { aggregateId: query.aggregateId } : {}),
      },
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.recipientUserId ? { recipientUserId: query.recipientUserId } : {}),
      ...(query.ruleId ? { ruleId: query.ruleId } : {}),
      ...(query.templateId ? { templateId: query.templateId } : {}),
      ...(query.triggerType || query.provider ? { attempts: { some: {
        ...(query.triggerType ? { triggerType: query.triggerType } : {}),
        ...(query.provider ? { provider: { equals: query.provider, mode: "insensitive" as const } } : {}),
      } } } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(query.search?.trim() ? { OR: [
        { destination: { contains: query.search.trim(), mode: "insensitive" } },
        { failureMessage: { contains: query.search.trim(), mode: "insensitive" } },
        { providerMessageId: { contains: query.search.trim(), mode: "insensitive" } },
        { event: { is: { eventName: { contains: query.search.trim(), mode: "insensitive" } } } },
        { rule: { is: { name: { contains: query.search.trim(), mode: "insensitive" } } } },
        { recipientUser: { is: { OR: [
          { fullName: { contains: query.search.trim(), mode: "insensitive" } },
          { email: { contains: query.search.trim(), mode: "insensitive" } },
        ] } } },
      ] } : {}),
    }
    const [data, total] = await this.prisma.withTenantTransaction(context, (tx) => Promise.all([
      tx.notificationDelivery.findMany({ where, select: {
        id: true, channel: true, status: true, destination: true, attemptCount: true,
        priority: true, orchestrationReason: true, deferredUntil: true, digestBucketId: true, escalationRunId: true,
        providerMessageId: true, failureCode: true, failureMessage: true,
        lastAttemptAt: true, nextAttemptAt: true, processingStartedAt: true,
        sentAt: true, deliveredAt: true, createdAt: true, updatedAt: true,
        event: { select: { eventName: true, occurredAt: true, aggregateType: true, aggregateId: true, actorId: true, payload: true } },
        recipientUser: { select: { id: true, fullName: true, email: true } },
        rule: { select: { id: true, name: true } },
        template: { select: { id: true, version: true, locale: true } },
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1, select: { triggerType: true, provider: true, triggeredByUser: { select: { id: true, fullName: true } } } },
      }, orderBy: { [query.sortBy]: query.sortDirection }, skip: (page - 1) * limit, take: limit }),
      tx.notificationDelivery.count({ where }),
    ]))
    return { data: data.map(item => this.deliverySummary(item)), meta: createPaginationMeta(page, limit, total) }
  }

  async getDelivery(id: string, user: CurrentUserPayload) {
    const context = tenantScope.require(user)
    const { organizationId } = context
    const item = await this.prisma.withTenantTransaction(context, (tx) =>
      tx.notificationDelivery.findFirst({ where: { id, organizationId }, select: {
        id: true, channel: true, status: true, destination: true, deduplicationKey: true,
        priority: true, orchestrationReason: true, deferredUntil: true, digestBucketId: true, escalationRunId: true,
        attemptCount: true, providerMessageId: true, failureCode: true, failureMessage: true,
        lastAttemptAt: true, nextAttemptAt: true, processingStartedAt: true,
        retryRequestedAt: true, sentAt: true, deliveredAt: true, createdAt: true, updatedAt: true,
        event: { select: { id: true, eventName: true, aggregateType: true, aggregateId: true, actorId: true, idempotencyKey: true, occurredAt: true, payload: true, actor: { select: { id: true, fullName: true } } } },
        recipientUser: { select: { id: true, fullName: true, email: true } },
        recipientRule: { select: { id: true, type: true, targetId: true } },
        retryRequestedBy: { select: { id: true, fullName: true } },
        rule: { select: { id: true, name: true, mandatory: true } },
        template: { select: { id: true, eventName: true, channel: true, locale: true, version: true, subject: true } },
        attempts: { orderBy: { attemptNumber: "asc" }, select: { id: true, attemptNumber: true, triggerType: true, status: true, provider: true, providerMessageId: true, failureCategory: true, failureCode: true, failureReason: true, startedAt: true, finishedAt: true, createdAt: true, triggeredByUser: { select: { id: true, fullName: true } } } },
      } }),
    )
    if (!item) throw new NotFoundException("Notification delivery not found")
    const schedule = this.scheduleMetadata(item.event.payload)
    return {
      ...item,
      destination: this.maskDestination(item.destination, item.channel),
      deduplicationKey: `${item.deduplicationKey.slice(0, 12)}…`,
      failureMessage: this.sanitizeFailure(item.failureMessage),
      event: { ...item.event, payload: undefined, schedule },
      attempts: item.attempts.map(attempt => ({ ...attempt, failureReason: this.sanitizeFailure(attempt.failureReason) })),
      triggerType: item.attempts[item.attempts.length - 1]?.triggerType ?? this.inferTriggerType(item.event.actorId, item.event.payload),
      triggeredBy: item.attempts[item.attempts.length - 1]?.triggeredByUser ?? item.event.actor,
      failureCategory: item.failureCode ? this.failureCategory(item.failureCode) : null,
      lastFailureAt: [...item.attempts].reverse().find(attempt => attempt.status === "FAILED")?.finishedAt ?? null,
      deduplication: { enabled: true, key: `${item.deduplicationKey.slice(0, 12)}…` },
    }
  }

  private deliverySummary<T extends { destination: string | null; channel: NotificationChannel; failureMessage: string | null; event: { actorId: string | null; payload: Prisma.JsonValue }; attempts: Array<{ triggerType: NotificationTriggerType; provider: string | null; triggeredByUser: { id: string; fullName: string } | null }> }>(item: T) {
    const latest = item.attempts[0]
    return { ...item, destination: this.maskDestination(item.destination, item.channel), failureMessage: this.sanitizeFailure(item.failureMessage), triggerType: latest?.triggerType ?? this.inferTriggerType(item.event.actorId, item.event.payload), provider: latest?.provider ?? item.channel, triggeredBy: latest?.triggeredByUser ?? null, event: { ...item.event, payload: undefined } }
  }

  private inferTriggerType(actorId: string | null, payload: Prisma.JsonValue) {
    const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
    if (value.schedule) return NotificationTriggerType.SCHEDULED
    return actorId ? NotificationTriggerType.DOMAIN_EVENT : NotificationTriggerType.SYSTEM
  }

  private scheduleMetadata(payload: Prisma.JsonValue) {
    const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
    const schedule = value.schedule && typeof value.schedule === "object" && !Array.isArray(value.schedule) ? value.schedule as Record<string, unknown> : null
    if (!schedule) return null
    const safe = ["scheduledAt", "detectedAt", "offsetMinutes", "sourceField"].reduce<Record<string, unknown>>((result, key) => {
      if (["string", "number", "boolean"].includes(typeof schedule[key])) result[key] = schedule[key]
      return result
    }, {})
    return Object.keys(safe).length ? safe : null
  }

  private maskDestination(value: string | null, channel: NotificationChannel) {
    if (!value) return null
    if (channel === NotificationChannel.EMAIL) {
      const [name, domain] = value.split("@")
      return domain ? `${name?.slice(0, 1) || "*"}***@${domain}` : "***"
    }
    if (channel === NotificationChannel.SMS) return value.length > 6 ? `${value.slice(0, 4)}***${value.slice(-3)}` : "***"
    return value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
  }

  private sanitizeFailure(value: string | null) {
    if (!value) return null
    return value.slice(0, 1000).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]").replace(/(api[-_ ]?key|password|token|secret)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").replace(/([?&](?:key|token|secret|signature)=)[^&\s]+/gi, "$1[REDACTED]")
  }

  private failureCategory(code: string) {
    const value = code.toUpperCase()
    if (value.includes("TIMEOUT")) return "TIMEOUT"
    if (value.includes("AUTH") || value.includes("401") || value.includes("403")) return "AUTHENTICATION"
    if (value.includes("RATE") || value.includes("429")) return "RATE_LIMIT"
    if (value.includes("DESTINATION") || value.includes("RECIPIENT") || value.includes("ENDPOINT")) return "INVALID_DESTINATION"
    if (value.includes("TEMPLATE")) return "TEMPLATE_ERROR"
    if (value.includes("CONFIG") || value.includes("NOT_CONFIGURED")) return "CONFIGURATION"
    if (value.includes("NETWORK") || value.includes("DISPATCH") || /^HTTP_5/.test(value)) return "NETWORK"
    if (value.includes("PROVIDER") || value.startsWith("HTTP_4")) return "PROVIDER_REJECTED"
    return "UNKNOWN"
  }

  async channelStatus(user: CurrentUserPayload) {
    const { organizationId } = tenantScope.require(user)
    const email = await this.prisma.organizationSettings.findUnique({ where: { organizationId }, select: { smtpEnabled: true, smtpHost: true, smtpPort: true, smtpFromEmail: true } })
    const emailConfigured = Boolean(email?.smtpEnabled && email.smtpHost && email.smtpPort && email.smtpFromEmail)
    return [
      { channel: "EMAIL", available: emailConfigured, configured: emailConfigured, usable: emailConfigured, provider: email?.smtpHost || null, configurationPath: "/admin/email-settings" },
      await this.smsSettings.status(organizationId),
      await this.pushSettings.status(tenantScope.require(user)),
      { channel: "IN_APP", available: true, configured: true, enabled: true, usable: true, provider: "Notification Center", configurationPath: null },
    ]
  }

  private assertEvent(eventName: string) {
    if (!allowedEvents.has(eventName)) throw new BadRequestException(`Unsupported notification event: ${eventName}`)
  }
  private requireInAppSubject(channel: NotificationChannel, subject: string | null | undefined) {
    if (channel === NotificationChannel.IN_APP && !subject?.trim()) throw new BadRequestException('عنوان قالب اعلان داخل سامانه الزامی است');
  }
  private date(value: string, field: string) {
    const result = new Date(value)
    if (Number.isNaN(result.getTime())) throw new BadRequestException(`${field} is invalid`)
    return result
  }
}
