import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  NotificationChannel,
  NotificationRecipientType,
  RoleScope,
  Prisma,
} from "@prisma/client"
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator"
import { tenantScope } from "../common/tenant/tenant-scope.util"
import { PrismaService } from "../prisma/prisma.service"
import type {
  CreateNotificationRuleDto,
  NotificationRecipientRuleInputDto,
  UpdateNotificationRuleDto,
} from "./dto/notification-rule.dto"
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_CATALOG,
} from "./notification-core.catalog"
import { NOTIFICATION_CONDITION_CATALOG } from "./policy/notification-condition.catalog"
import { NotificationPolicyConditionValidator } from "./policy/notification-policy-condition-validator.service"
import { NOTIFICATION_SCHEDULE_CATALOG } from "./schedule/notification-schedule.catalog"
import { NotificationScheduleValidator } from "./schedule/notification-schedule-validator.service"

const ruleInclude = {
  schedule: true,
  recipientRules: {
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.NotificationRuleInclude

const ALLOWED_EVENTS = new Set<string>([
  ...Object.values(NOTIFICATION_EVENT_CATALOG.MEETING),
  ...Object.values(NOTIFICATION_EVENT_CATALOG.TASK),
  ...Object.values(NOTIFICATION_EVENT_CATALOG.OPPORTUNITY),
  ...Object.values(NOTIFICATION_EVENT_CATALOG.CONVERSATION),
])
const ALLOWED_CHANNELS = new Set<string>(NOTIFICATION_CHANNELS)

@Injectable()
export class NotificationRulesService {
  constructor(private readonly prisma: PrismaService, private readonly conditionValidator: NotificationPolicyConditionValidator, private readonly scheduleValidator: NotificationScheduleValidator) {}

  list(user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    return this.prisma.withTenantTransaction(tenant, (tx) => tx.notificationRule.findMany({
      where: { organizationId: tenant.organizationId },
      include: ruleInclude,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }))
  }

  async get(id: string, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    const rule = await this.prisma.withTenantTransaction(tenant, (tx) =>
      tx.notificationRule.findFirst({
        where: { id, organizationId: tenant.organizationId },
        include: ruleInclude,
      }),
    )
    if (!rule) throw new NotFoundException("Notification rule not found")
    return rule
  }

  async create(dto: CreateNotificationRuleDto, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    this.validateEvent(dto.eventName)
    const conditions = this.conditionValidator.validate(dto.eventName, dto.conditions)
    const schedule = this.scheduleValidator.validate(dto.eventName, dto.schedule)
    await this.validateRecipients(dto.recipientRules, tenant.organizationId)
    await this.validateDigestPolicy(dto.digestPolicyId, tenant.organizationId)

    return this.prisma.withTenantTransaction(tenant, (tx) => tx.notificationRule.create({
      data: {
        organizationId: tenant.organizationId,
        name: dto.name.trim(),
        eventName: dto.eventName,
        enabled: dto.enabled ?? true,
        mandatory: dto.mandatory ?? false,
        priority: dto.priority ?? 100,
        deliveryPriority: dto.deliveryPriority,
        digestPolicyId: dto.digestPolicyId ?? null,
        conditions: conditions === null ? Prisma.DbNull : conditions as Prisma.InputJsonValue,
        ...(schedule ? { schedule: { create: { organizationId: tenant.organizationId, ...schedule } } } : {}),
        recipientRules: {
          create: dto.recipientRules.map((recipient) =>
            this.recipientCreateData(recipient),
          ),
        },
      },
      include: ruleInclude,
    }))
  }

  async update(
    id: string,
    dto: UpdateNotificationRuleDto,
    user: CurrentUserPayload,
  ) {
    const tenant = tenantScope.require(user)
    const current = await this.get(id, user)
    if (dto.eventName) this.validateEvent(dto.eventName)
    const effectiveEventName = dto.eventName ?? current.eventName
    const effectiveConditions = dto.conditions !== undefined ? dto.conditions : current.conditions
    const conditions = this.conditionValidator.validate(effectiveEventName, effectiveConditions)
    const effectiveSchedule = dto.schedule !== undefined ? dto.schedule : current.schedule ? { enabled: current.schedule.enabled, type: current.schedule.scheduleType, sourceField: current.schedule.sourceField, triggerMode: current.schedule.triggerMode, offsetMinutes: current.schedule.offsetMinutes, gracePeriodMinutes: current.schedule.gracePeriodMinutes } : null
    const schedule = this.scheduleValidator.validate(effectiveEventName, effectiveSchedule)
    if (dto.recipientRules) {
      await this.validateRecipients(dto.recipientRules, tenant.organizationId)
    }
    if (dto.digestPolicyId !== undefined) await this.validateDigestPolicy(dto.digestPolicyId, tenant.organizationId)

    return this.prisma.withTenantTransaction(tenant, async (tx) => {
      if (dto.recipientRules) {
        await tx.notificationRecipientRule.deleteMany({ where: { ruleId: id } })
      }
      if (dto.schedule !== undefined || dto.eventName !== undefined) {
        if (schedule) {
          await tx.notificationSchedule.upsert({ where: { ruleId: id }, create: { ruleId: id, organizationId: tenant.organizationId, ...schedule }, update: schedule })
        } else {
          await tx.notificationSchedule.deleteMany({ where: { ruleId: id, organizationId: tenant.organizationId } })
        }
      }

      return tx.notificationRule.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.eventName !== undefined ? { eventName: dto.eventName } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.mandatory !== undefined ? { mandatory: dto.mandatory } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.deliveryPriority !== undefined ? { deliveryPriority: dto.deliveryPriority } : {}),
          ...(dto.digestPolicyId !== undefined ? { digestPolicyId: dto.digestPolicyId || null } : {}),
          ...(dto.conditions !== undefined || dto.eventName !== undefined ? { conditions: conditions === null ? Prisma.DbNull : conditions as Prisma.InputJsonValue } : {}),
          ...(dto.recipientRules
            ? {
                recipientRules: {
                  create: dto.recipientRules.map((recipient) =>
                    this.recipientCreateData(recipient),
                  ),
                },
              }
            : {}),
        },
        include: ruleInclude,
      })
    })
  }

  async remove(id: string, user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    const deleted = await this.prisma.withTenantTransaction(tenant, (tx) =>
      tx.notificationRule.deleteMany({ where: { id, organizationId: tenant.organizationId } }),
    )
    if (!deleted.count) throw new NotFoundException("Notification rule not found")
    return { deleted: true }
  }

  catalog() {
    return {
      events: [...ALLOWED_EVENTS],
      conditionEvents: Object.values(NOTIFICATION_CONDITION_CATALOG),
      scheduleEvents: Object.values(NOTIFICATION_SCHEDULE_CATALOG).map((item) => ({
        eventName: item.eventName, label: item.label, supportsSchedule: true,
        scheduleOptions: { type: item.scheduleType, sourceField: item.sourceField, triggerModes: item.triggerModes, suggestedOffsetsMinutes: item.suggestedOffsetsMinutes, defaultGracePeriodMinutes: item.defaultGracePeriodMinutes },
      })),
      recipientTypes: Object.values(NotificationRecipientType),
      channels: Object.values(NotificationChannel),
    }
  }

  async userTargets(user: CurrentUserPayload, search?: string) {
    const tenant = tenantScope.require(user)
    return this.prisma.user.findMany({
      where: {
        organizationId: tenant.organizationId,
        isActive: true,
        ...(search?.trim()
          ? {
              OR: [
                { fullName: { contains: search.trim(), mode: "insensitive" } },
                { email: { contains: search.trim(), mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
      take: 100,
    })
  }

  async teamTargets(user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    return this.prisma.team.findMany({
      where: { organizationId: tenant.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    })
  }

  async roleTargets(user: CurrentUserPayload) {
    const tenant = tenantScope.require(user)
    return this.prisma.role.findMany({
      where: {
        isActive: true,
        OR: [
          { scope: RoleScope.SYSTEM },
          { scope: RoleScope.TENANT, organizationId: tenant.organizationId },
        ],
      },
      select: {
        id: true,
        code: true,
        normalizedCode: true,
        name: true,
        scope: true,
        baseRole: true,
      },
      orderBy: [{ scope: "asc" }, { name: "asc" }],
      take: 100,
    })
  }

  private validateEvent(eventName: string) {
    if (!ALLOWED_EVENTS.has(eventName)) {
      throw new BadRequestException(`Unsupported notification event: ${eventName}`)
    }
  }

  private async validateDigestPolicy(id: string | null | undefined, organizationId: string) {
    if (!id) return
    const policy = await this.prisma.notificationDigestPolicy.findFirst({ where: { id, organizationId, enabled: true }, select: { id: true } })
    if (!policy) throw new BadRequestException("Digest policy is unavailable in the current organization")
  }

  private recipientCreateData(recipient: NotificationRecipientRuleInputDto) {
    return {
      type: recipient.type,
      targetId: recipient.targetId ?? null,
      channels: [...new Set(recipient.channels)],
      enabled: recipient.enabled ?? true,
    }
  }

  private async validateRecipients(
    recipients: NotificationRecipientRuleInputDto[],
    organizationId: string,
  ) {
    for (const recipient of recipients) {
      const channels = [...new Set(recipient.channels)]
      if (!channels.length || channels.some((channel) => !ALLOWED_CHANNELS.has(channel))) {
        throw new BadRequestException("Recipient must define supported channels")
      }

      const requiresTarget =
        recipient.type === NotificationRecipientType.USER ||
        recipient.type === NotificationRecipientType.ROLE ||
        recipient.type === NotificationRecipientType.TEAM

      if (requiresTarget && !recipient.targetId) {
        throw new BadRequestException(`${recipient.type} recipient requires targetId`)
      }
      if (!requiresTarget && recipient.targetId) {
        throw new BadRequestException(
          `${recipient.type} recipient must not define targetId`,
        )
      }

      if (recipient.type === NotificationRecipientType.USER && recipient.targetId) {
        const target = await this.prisma.user.findFirst({
          where: {
            id: recipient.targetId,
            organizationId,
            isActive: true,
          },
          select: { id: true },
        })
        if (!target) throw new BadRequestException("Recipient user is unavailable")
      }

      if (recipient.type === NotificationRecipientType.TEAM && recipient.targetId) {
        const target = await this.prisma.team.findFirst({
          where: {
            id: recipient.targetId,
            organizationId,
            isActive: true,
          },
          select: { id: true },
        })
        if (!target) throw new BadRequestException("Recipient team is unavailable")
      }

      if (recipient.type === NotificationRecipientType.ROLE && recipient.targetId) {
        const target = await this.prisma.role.findFirst({
          where: {
            id: recipient.targetId,
            isActive: true,
            OR: [
              { scope: RoleScope.SYSTEM },
              { scope: RoleScope.TENANT, organizationId },
            ],
          },
          select: { id: true },
        })
        if (!target) throw new BadRequestException("Recipient role is unavailable")
      }
    }
  }
}
