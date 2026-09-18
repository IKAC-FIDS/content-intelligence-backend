import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { NotificationChannel, NotificationRecipientType, Prisma } from "@prisma/client"
import type { CurrentUserPayload } from "../../common/decorators/current-user.decorator"
import { tenantScope } from "../../common/tenant/tenant-scope.util"
import { AuditLogService } from "../../audit-log/audit-log.service"
import { PrismaService } from "../../prisma/prisma.service"
import type { CreateDigestPolicyDto, CreateEscalationPolicyDto, UpdateDigestPolicyDto, UpdateEscalationPolicyDto, UpdateQuietHoursDto } from "../dto/notification-orchestration.dto"
import { assertTime, assertTimeZone } from "./notification-time-window"
import { NotificationPolicyConditionValidator } from "../policy/notification-policy-condition-validator.service"
import { notificationTenantContext } from "../in-app/notification-tenant-context"

@Injectable()
export class NotificationPolicyAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly conditions: NotificationPolicyConditionValidator) {}

  async quietHours(user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    return this.prisma.withTenantTransaction(tenant, tx => tx.notificationQuietHoursPolicy.findUnique({ where: { organizationId: tenant.organizationId } }))
  }

  async updateQuietHours(dto: UpdateQuietHoursDto, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user); this.validateClock(dto.startTime, dto.timezone); this.validateClock(dto.endTime, dto.timezone)
    const before = await this.quietHours(user)
    const result = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationQuietHoursPolicy.upsert({ where: { organizationId: tenant.organizationId }, create: { organizationId: tenant.organizationId, ...dto }, update: dto }))
    await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_QUIET_HOURS", entityId: result.id, action: "UPDATE", before, after: result })
    return result
  }

  listDigests(user: CurrentUserPayload) { const tenant = tenantScope.require(user); return this.prisma.withTenantTransaction(tenant, tx => tx.notificationDigestPolicy.findMany({ where: { organizationId: tenant.organizationId }, orderBy: { createdAt: "desc" } })) }
  async createDigest(dto: CreateDigestPolicyDto, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user); this.validateDigest(dto); await this.validateTemplates(tenant.organizationId, dto.eventNames, dto.channels)
    const result = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationDigestPolicy.create({ data: { organizationId: tenant.organizationId, ...dto } }))
    await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_DIGEST_POLICY", entityId: result.id, action: "CREATE", after: result }); return result
  }
  async updateDigest(id: string, dto: UpdateDigestPolicyDto, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user); const before = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationDigestPolicy.findFirst({ where: { id, organizationId: tenant.organizationId } })); if (!before) throw new NotFoundException("Digest policy not found")
    this.validateDigest({ ...before, ...dto }); await this.validateTemplates(tenant.organizationId, dto.eventNames ?? before.eventNames, dto.channels ?? before.channels)
    const result = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationDigestPolicy.update({ where: { id }, data: dto }))
    await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_DIGEST_POLICY", entityId: id, action: "UPDATE", before, after: result }); return result
  }
  async removeDigest(id: string, user: CurrentUserPayload) { const tenant = tenantScope.require(user); const result = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationDigestPolicy.updateMany({ where: { id, organizationId: tenant.organizationId }, data: { enabled: false } })); if (!result.count) throw new NotFoundException("Digest policy not found"); await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_DIGEST_POLICY", entityId: id, action: "DISABLE" }); return { disabled: true } }

  listEscalations(user: CurrentUserPayload) { const tenant = tenantScope.require(user); return this.prisma.withTenantTransaction(tenant, tx => tx.notificationEscalationPolicy.findMany({ where: { organizationId: tenant.organizationId }, include: { steps: { orderBy: { stepOrder: "asc" } } }, orderBy: { createdAt: "desc" } })) }
  async createEscalation(dto: CreateEscalationPolicyDto, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user); this.validateEscalation(dto); this.conditions.validate(dto.eventName, dto.conditions); await this.validateTemplates(tenant.organizationId, [dto.eventName], [...new Set(dto.steps.flatMap(step => step.channels))])
    const result = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationEscalationPolicy.create({ data: { organizationId: tenant.organizationId, name: dto.name.trim(), enabled: dto.enabled ?? true, eventName: dto.eventName, aggregateType: dto.aggregateType ?? "TASK", conditions: dto.conditions === null || dto.conditions === undefined ? Prisma.DbNull : dto.conditions as Prisma.InputJsonValue, steps: { create: dto.steps.map((step, index) => ({ ...step, targetId: step.targetId ?? null, stepOrder: index + 1 })) } }, include: { steps: true } }))
    await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_ESCALATION_POLICY", entityId: result.id, action: "CREATE", after: result }); return result
  }
  async updateEscalation(id: string, dto: UpdateEscalationPolicyDto, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user); const before = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationEscalationPolicy.findFirst({ where: { id, organizationId: tenant.organizationId }, include: { steps: true } })); if (!before) throw new NotFoundException("Escalation policy not found")
    if (dto.steps) this.validateEscalation({ ...before, ...dto, steps: dto.steps })
    this.conditions.validate(dto.eventName ?? before.eventName, dto.conditions !== undefined ? dto.conditions : before.conditions)
    await this.validateTemplates(tenant.organizationId, [dto.eventName ?? before.eventName], [...new Set((dto.steps ?? before.steps).flatMap(step => step.channels))])
    const effective = { name: dto.name?.trim() ?? before.name, enabled: dto.enabled ?? before.enabled, eventName: dto.eventName ?? before.eventName, aggregateType: dto.aggregateType ?? before.aggregateType, conditions: dto.conditions !== undefined ? dto.conditions : before.conditions, steps: dto.steps ?? before.steps.map(step => ({ delayMinutes: step.delayMinutes, recipientType: step.recipientType, targetId: step.targetId, channels: step.channels, priority: step.priority, mandatory: step.mandatory })) }
    const result = await this.prisma.withTenantTransaction(tenant, async tx => {
      await tx.notificationEscalationPolicy.update({ where: { id }, data: { enabled: false } })
      return tx.notificationEscalationPolicy.create({ data: { organizationId: tenant.organizationId, name: effective.name, enabled: effective.enabled, eventName: effective.eventName, aggregateType: effective.aggregateType, conditions: effective.conditions === null ? Prisma.DbNull : effective.conditions as Prisma.InputJsonValue, steps: { create: effective.steps.map((step, index) => ({ ...step, targetId: step.targetId ?? null, stepOrder: index + 1 })) } }, include: { steps: { orderBy: { stepOrder: "asc" } } } })
    })
    await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_ESCALATION_POLICY", entityId: result.id, action: "VERSION", before, after: result, metadata: { previousPolicyId: id } }); return result
  }
  async removeEscalation(id: string, user: CurrentUserPayload) { const tenant = tenantScope.require(user); const result = await this.prisma.withTenantTransaction(tenant, tx => tx.notificationEscalationPolicy.updateMany({ where: { id, organizationId: tenant.organizationId }, data: { enabled: false } })); if (!result.count) throw new NotFoundException("Escalation policy not found"); await this.audit.recordTenantEvent({ organizationId: tenant.organizationId, actorId: user.userId, entityType: "NOTIFICATION_ESCALATION_POLICY", entityId: id, action: "DISABLE" }); return { disabled: true } }

  private validateClock(time: string, timezone: string) { try { assertTime(time); assertTimeZone(timezone) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "Invalid time settings") } }
  private validateDigest(dto: Pick<CreateDigestPolicyDto, "sendTime" | "timezone" | "channels">) { this.validateClock(dto.sendTime, dto.timezone); if (dto.channels.some(channel => channel !== NotificationChannel.EMAIL)) throw new BadRequestException("Daily digest currently supports EMAIL only") }
  private validateEscalation(dto: Pick<CreateEscalationPolicyDto, "steps">) {
    if (new Set(dto.steps.map(step => step.delayMinutes)).size !== dto.steps.length) throw new BadRequestException("Escalation delays must be unique")
    dto.steps.forEach((step, index) => { if (index && step.delayMinutes < dto.steps[index - 1]!.delayMinutes) throw new BadRequestException("Escalation delays must be ascending"); const requiresTarget = step.recipientType === NotificationRecipientType.USER || step.recipientType === NotificationRecipientType.ROLE || step.recipientType === NotificationRecipientType.TEAM; if (requiresTarget !== Boolean(step.targetId)) throw new BadRequestException("Escalation recipient target is invalid") })
  }
  private async validateTemplates(organizationId: string, eventNames: string[], channels: NotificationChannel[]) {
    const rows = await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.notificationTemplate.findMany({ where: { organizationId, eventName: { in: eventNames }, channel: { in: channels }, isActive: true }, select: { eventName: true, channel: true } }))
    const available = new Set(rows.map(row => `${row.eventName}:${row.channel}`))
    const missing = eventNames.flatMap(eventName => channels.map(channel => `${eventName}:${channel}`)).filter(key => !available.has(key))
    if (missing.length) throw new BadRequestException(`Active templates are required: ${missing.join(", ")}`)
  }
}
