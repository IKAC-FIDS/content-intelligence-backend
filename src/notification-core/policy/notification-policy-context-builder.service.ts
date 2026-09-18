import { Injectable } from "@nestjs/common"
import type { NotificationEvent } from "@prisma/client"
import type { TenantTransactionClient } from "../../prisma/prisma.service"
import type { NotificationPolicyContext } from "./notification-policy.types"

@Injectable()
export class NotificationPolicyContextBuilder {
  async build(event: NotificationEvent, db: TenantTransactionClient): Promise<NotificationPolicyContext> {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {}
    const actor = event.actorId ? await db.user.findFirst({ where: { id: event.actorId, organizationId: event.organizationId }, select: { id: true, roleId: true, teamId: true } }) : null
    const schedule = payload.schedule && typeof payload.schedule === "object" && !Array.isArray(payload.schedule) ? payload.schedule as Record<string, unknown> : null
    const context: NotificationPolicyContext = { event: { name: event.eventName }, actor: { id: actor?.id ?? event.actorId ?? null, roleId: actor?.roleId ?? null, teamId: actor?.teamId ?? null }, organization: { id: event.organizationId }, task: null, meeting: null, opportunity: null, schedule: schedule ? { offsetMinutes: typeof schedule.offsetMinutes === "number" ? schedule.offsetMinutes : 0, scheduledAt: this.text(schedule.scheduledAt) ?? event.occurredAt.toISOString(), detectedAt: this.text(schedule.detectedAt) } : null }
    if (event.aggregateType === "TASK") {
      const task = await db.task.findFirst({ where: { id: event.aggregateId, organizationId: event.organizationId }, select: { id: true, title: true, priority: true, status: true, dueAt: true, assignedToId: true, teamId: true, createdById: true } })
      if (task) context.task = { id: task.id, title: task.title, priority: task.priority, status: task.status, dueAt: task.dueAt?.toISOString() ?? null, assigneeId: task.assignedToId, teamId: task.teamId, creatorId: task.createdById }
    } else if (event.aggregateType === "MEETING") {
      const meeting = await db.meeting.findFirst({ where: { id: event.aggregateId, organizationId: event.organizationId }, select: { id: true, title: true, status: true, startAt: true, organizerId: true, type: { select: { code: true } } } })
      if (meeting) context.meeting = { id: meeting.id, title: meeting.title, type: meeting.type?.code ?? null, status: meeting.status, startAt: meeting.startAt.toISOString(), organizerId: meeting.organizerId }
    } else if (event.aggregateType === "OPPORTUNITY") {
      const opportunity = await db.opportunity.findFirst({ where: { id: event.aggregateId, organizationId: event.organizationId }, select: { id: true, title: true, priority: true, probability: true, ownerId: true, stage: { select: { code: true } } } })
      context.opportunity = { id: opportunity?.id ?? event.aggregateId, title: opportunity?.title ?? null, priority: opportunity?.priority ?? null, probability: opportunity?.probability ?? null, ownerId: opportunity?.ownerId ?? null, stage: opportunity?.stage.code ?? null, fromStage: this.text(payload.fromStage), toStage: this.text(payload.toStage) ?? opportunity?.stage.code ?? null }
    }
    return context
  }

  private text(value: unknown) { return typeof value === "string" && value.length <= 500 ? value : null }
}
