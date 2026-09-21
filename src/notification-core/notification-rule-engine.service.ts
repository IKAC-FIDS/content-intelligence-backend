import { Injectable, NotFoundException, Optional } from "@nestjs/common"
import {
  NotificationRecipientType,
  OrganizationMembershipStatus,
  type NotificationEvent,
  type NotificationRecipientRule,
} from "@prisma/client"
import { PrismaService, type TenantTransactionClient } from "../prisma/prisma.service"
import { NotificationTemplateEngineService } from "./notification-template-engine.service"
import { NotificationPolicyContextBuilder } from "./policy/notification-policy-context-builder.service"
import { NotificationPolicyEvaluatorService } from "./policy/notification-policy-evaluator.service"
import { NotificationDeliveryService } from "./deduplication/notification-delivery.service"
import { NotificationOrchestrationService } from "./orchestration/notification-orchestration.service"

@Injectable()
export class NotificationRuleEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: NotificationTemplateEngineService,
    private readonly contextBuilder: NotificationPolicyContextBuilder,
    private readonly policyEvaluator: NotificationPolicyEvaluatorService,
    private readonly deliveries: NotificationDeliveryService,
    @Optional() private readonly orchestration?: NotificationOrchestrationService,
  ) {}

  async evaluateEvent(event: NotificationEvent, db: TenantTransactionClient = this.prisma) {
    const rules = await db.notificationRule.findMany({
      where: {
        organizationId: event.organizationId,
        eventName: event.eventName,
        enabled: true,
      },
      include: {
        schedule: true,
        recipientRules: {
          where: { enabled: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    })

    let created = 0
    let duplicate = 0
    let unresolved = 0
    let matchedRules = 0
    const needsPolicyContext = rules.some(rule => this.policyEvaluator.hasConditions(rule.conditions))
    const policyContext = needsPolicyContext ? await this.contextBuilder.build(event, db) : null

    for (const rule of rules) {
      if (!this.scheduleMatches(rule.schedule, event)) continue
      if (policyContext && !this.policyEvaluator.evaluate(rule.conditions, policyContext).matches) continue
      matchedRules += 1
      for (const recipientRule of rule.recipientRules) {
        const recipientIds = (await this.resolveRecipientIds(event, recipientRule, db)).filter(id => id !== event.actorId)
        if (!recipientIds.length) {
          unresolved += recipientRule.channels.length
          continue
        }

        for (const recipientUserId of recipientIds) {
          for (const channel of recipientRule.channels) {
            try {
              const rendered = await this.templateEngine.renderDelivery(event, recipientUserId, channel, db)
              const decision = this.orchestration ? await this.orchestration.decide(event, rule, recipientUserId, channel, db) : undefined
              const result = await this.deliveries.createPendingDelivery({ event, ruleId: rule.id, recipientRuleId: recipientRule.id, recipientUserId, templateId: rendered.template.id, channel, priority: rule.deliveryPriority, decision }, db)
              if (result.status === "CREATED") created += 1
              else duplicate += 1
            } catch (error) {
              if (error instanceof NotFoundException) {
                unresolved += 1
                continue
              }
              throw error
            }
          }
        }
      }
    }

    return { rules: rules.length, matchedRules, created, duplicate, unresolved }
  }

  async resolveRecipientIds(
    event: NotificationEvent,
    rule: Pick<NotificationRecipientRule, "type" | "targetId">,
    db: TenantTransactionClient,
  ): Promise<string[]> {
    switch (rule.type) {
      case NotificationRecipientType.USER:
        return this.activeUsers(event.organizationId, rule.targetId ? [rule.targetId] : [], db)

      case NotificationRecipientType.ROLE:
        return this.usersByRole(event.organizationId, rule.targetId, db)

      case NotificationRecipientType.TEAM:
        return this.usersByTeam(event.organizationId, rule.targetId, db)

      case NotificationRecipientType.ASSIGNEE:
        return this.aggregateAssignees(event, db)

      case NotificationRecipientType.CREATOR:
        return this.aggregateCreator(event, db)

      case NotificationRecipientType.OWNER:
        return this.payloadIds(event, "ownerUserId", db)

      case NotificationRecipientType.MANAGER:
        return this.aggregateManagers(event, db)

      default:
        return []
    }
  }

  private async usersByRole(organizationId: string, roleId: string | null, db: TenantTransactionClient) {
    if (!roleId) return []
    const users = await db.user.findMany({
      where: {
        isActive: true,
        OR: [
          { organizationId, roleId },
          {
            organizationMemberships: {
              some: {
                organizationId,
                status: OrganizationMembershipStatus.ACTIVE,
                roleId,
              },
            },
          },
        ],
      },
      select: { id: true },
    })
    return this.unique(users.map((item) => item.id))
  }

  private async usersByTeam(organizationId: string, teamId: string | null, db: TenantTransactionClient) {
    if (!teamId) return []
    const users = await db.user.findMany({
      where: {
        isActive: true,
        OR: [
          { organizationId, teamId },
          {
            organizationMemberships: {
              some: {
                organizationId,
                status: OrganizationMembershipStatus.ACTIVE,
                teamId,
              },
            },
          },
        ],
      },
      select: { id: true },
    })
    return this.unique(users.map((item) => item.id))
  }

  private async aggregateAssignees(event: NotificationEvent, db: TenantTransactionClient) {
    const payloadRecipients = await this.payloadIds(event, "assigneeUserIds", db)
    if (payloadRecipients.length) return payloadRecipients
    if (event.aggregateType === "MEETING") {
      const rows = await db.meetingAssignee.findMany({
        where: {
          meetingId: event.aggregateId,
          meeting: { organizationId: event.organizationId },
        },
        select: { userId: true },
      })
      return this.activeUsers(event.organizationId, rows.map((row) => row.userId), db)
    }

    if (event.aggregateType === "TASK") {
      const task = await db.task.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { assignedToId: true },
      })
      return this.activeUsers(
        event.organizationId,
        task?.assignedToId ? [task.assignedToId] : [], db,
      )
    }

    return this.payloadIds(event, "assigneeUserIds", db)
  }

  private async aggregateCreator(event: NotificationEvent, db: TenantTransactionClient) {
    if (event.aggregateType === "MEETING") {
      const meeting = await db.meeting.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { createdById: true },
      })
      return this.activeUsers(
        event.organizationId,
        meeting?.createdById ? [meeting.createdById] : [], db,
      )
    }

    if (event.aggregateType === "TASK") {
      const task = await db.task.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { createdById: true },
      })
      return this.activeUsers(
        event.organizationId,
        task?.createdById ? [task.createdById] : [], db,
      )
    }

    return this.payloadIds(event, "creatorUserId", db)
  }

  private async aggregateManagers(event: NotificationEvent, db: TenantTransactionClient) {
    let teamIds: string[] = []

    if (event.aggregateType === "TASK") {
      const task = await db.task.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { teamId: true, assignedToId: true },
      })
      const membershipTeams = task?.assignedToId
        ? await db.organizationMembershipTeam.findMany({
            where: {
              membership: {
                userId: task.assignedToId,
                organizationId: event.organizationId,
              },
            },
            select: { teamId: true },
          })
        : []
      teamIds = [task?.teamId, ...membershipTeams.map((row) => row.teamId)].filter(
        (value): value is string => Boolean(value),
      )
    } else if (event.aggregateType === "MEETING") {
      const rows = await db.meetingAssignee.findMany({
        where: {
          meetingId: event.aggregateId,
          meeting: { organizationId: event.organizationId },
        },
        select: { userId: true },
      })
      const membershipTeams = await db.organizationMembershipTeam.findMany({
        where: {
          membership: {
            userId: { in: rows.map((row) => row.userId) },
            organizationId: event.organizationId,
          },
        },
        select: { teamId: true },
      })
      teamIds = membershipTeams.map((row) => row.teamId)
    }

    if (!teamIds.length) return this.payloadIds(event, "managerUserIds", db)

    const teams = await db.team.findMany({
      where: {
        id: { in: this.unique(teamIds) },
        organizationId: event.organizationId,
        isActive: true,
      },
      select: { managerId: true },
    })
    return this.activeUsers(
      event.organizationId,
      teams
        .map((team) => team.managerId)
        .filter((value): value is string => Boolean(value)), db,
    )
  }

  private async payloadIds(event: NotificationEvent, key: string, db: TenantTransactionClient) {
    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {}
    const value = payload[key]
    const ids = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : typeof value === "string"
        ? [value]
        : []
    return this.activeUsers(event.organizationId, ids, db)
  }

  private async activeUsers(organizationId: string, ids: string[], db: TenantTransactionClient) {
    const uniqueIds = this.unique(ids)
    if (!uniqueIds.length) return []
    const users = await db.user.findMany({
      where: { id: { in: uniqueIds }, organizationMemberships: { some: { organizationId, status: OrganizationMembershipStatus.ACTIVE } }, isActive: true },
      select: { id: true },
    })
    return users.map((user) => user.id)
  }

  private unique(values: string[]) {
    return [...new Set(values)]
  }

  private scheduleMatches(schedule: { offsetMinutes: number; sourceField: string; triggerMode: string } | null, event: NotificationEvent) {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {}
    const metadata = payload.schedule && typeof payload.schedule === "object" && !Array.isArray(payload.schedule) ? payload.schedule as Record<string, unknown> : null
    if (!metadata) return schedule == null
    return Boolean(schedule) && schedule?.offsetMinutes === metadata.offsetMinutes
  }
}
