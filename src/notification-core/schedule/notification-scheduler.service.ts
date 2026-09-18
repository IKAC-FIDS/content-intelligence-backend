import { Injectable, Logger, Optional } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"
import { MeetingStatus, OrganizationStatus, TaskStatus, type NotificationSchedule } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationCoreService } from "../notification-core.service"
import { notificationTenantContext } from "../in-app/notification-tenant-context"
import type { NotificationEventName } from "../notification-core.catalog"
import { NotificationEscalationService } from "../orchestration/notification-escalation.service"

const MINUTE = 60_000
const BATCH_SIZE = 500
const OVERDUE_LOOKBACK_MINUTES = 525600

export function scheduledAt(sourceAt: Date, offsetMinutes: number) {
  return new Date(sourceAt.getTime() + offsetMinutes * MINUTE)
}

export function isDue(triggerAt: Date, now: Date, gracePeriodMinutes: number) {
  const lateMs = now.getTime() - triggerAt.getTime()
  return lateMs >= 0 && lateMs <= gracePeriodMinutes * MINUTE
}

export function scheduledOccurrenceKey(eventName: string, aggregateId: string, sourceAt: Date, offsetMinutes: number) {
  return `${eventName}:${aggregateId}:${sourceAt.toISOString()}:OFFSET:${offsetMinutes}`
}

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name)
  private running = false
  private lastRunAt = 0

  constructor(private readonly prisma: PrismaService, private readonly core: NotificationCoreService, @Optional() private readonly escalations?: NotificationEscalationService) {}

  @Interval(60_000)
  async tick() {
    if (!this.enabled()) return
    const intervalMs = this.intervalMinutes() * MINUTE
    if (Date.now() - this.lastRunAt < intervalMs || this.running) return
    this.running = true
    this.lastRunAt = Date.now()
    const startedAt = Date.now()
    const metrics = { schedulesEvaluated: 0, candidateMeetings: 0, candidateTasks: 0, eventsPublished: 0, eventsSkipped: 0, duplicates: 0, errors: 0 }
    this.logger.log(JSON.stringify({ event: "scheduler.scan.started" }))
    try {
      const organizations = await this.prisma.organization.findMany({ where: { status: OrganizationStatus.ACTIVE }, select: { id: true } })
      for (const organization of organizations) {
        try { await this.scanOrganization(organization.id, new Date(), metrics) }
        catch (error) { metrics.errors += 1; this.safeError("ORGANIZATION", organization.id, organization.id, undefined, error) }
      }
    } finally {
      this.running = false
      this.logger.log(JSON.stringify({ event: "scheduler.scan.completed", ...metrics, durationMs: Date.now() - startedAt }))
    }
  }

  async scanOrganization(organizationId: string, now = new Date(), metrics = { schedulesEvaluated: 0, candidateMeetings: 0, candidateTasks: 0, eventsPublished: 0, eventsSkipped: 0, duplicates: 0, errors: 0 }) {
    const context = notificationTenantContext(organizationId)
    const schedules = await this.prisma.withTenantTransaction(context, tx => tx.notificationSchedule.findMany({
      where: { organizationId, enabled: true, rule: { enabled: true } }, include: { rule: { select: { eventName: true } } }, orderBy: { createdAt: "asc" },
    }))
    for (const schedule of schedules) {
      metrics.schedulesEvaluated += 1
      try {
        if (schedule.rule.eventName === "MEETING.REMINDER") await this.scanMeetings(organizationId, schedule, schedule.rule.eventName, now, metrics)
        else if (schedule.rule.eventName === "TASK.DUE_SOON") await this.scanDueSoonTasks(organizationId, schedule, schedule.rule.eventName, now, metrics)
        else if (schedule.rule.eventName === "TASK.OVERDUE") await this.scanOverdueTasks(organizationId, schedule, schedule.rule.eventName, now, metrics)
        await this.prisma.withTenantTransaction(context, tx => tx.notificationSchedule.updateMany({ where: { id: schedule.id, organizationId }, data: { lastEvaluatedAt: now } }))
      } catch (error) { metrics.errors += 1; this.safeError("SCHEDULE", schedule.id, organizationId, schedule.rule.eventName, error) }
    }
    if (this.escalations) await this.escalations.processOrganization(organizationId, now)
    return metrics
  }

  private async scanMeetings(organizationId: string, schedule: NotificationSchedule, eventName: NotificationEventName, now: Date, metrics: Record<string, number>) {
    const sourceEnd = new Date(now.getTime() - schedule.offsetMinutes * MINUTE)
    const sourceStart = new Date(sourceEnd.getTime() - schedule.gracePeriodMinutes * MINUTE)
    const meetings = await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.meeting.findMany({
      where: { organizationId, status: MeetingStatus.SCHEDULED, startAt: { gt: now, gte: sourceStart, lte: sourceEnd } }, select: { id: true, startAt: true }, orderBy: { startAt: "asc" }, take: BATCH_SIZE,
    }))
    metrics.candidateMeetings += meetings.length
    for (const meeting of meetings) await this.publishCandidate(organizationId, eventName, "MEETING", meeting.id, meeting.startAt, schedule, now, metrics)
  }

  private async scanDueSoonTasks(organizationId: string, schedule: NotificationSchedule, eventName: NotificationEventName, now: Date, metrics: Record<string, number>) {
    const sourceEnd = new Date(now.getTime() - schedule.offsetMinutes * MINUTE)
    const sourceStart = new Date(sourceEnd.getTime() - schedule.gracePeriodMinutes * MINUTE)
    const tasks = await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.task.findMany({
      where: { organizationId, dueAt: { gt: now, gte: sourceStart, lte: sourceEnd }, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } }, select: { id: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: BATCH_SIZE,
    }))
    metrics.candidateTasks += tasks.length
    for (const task of tasks) if (task.dueAt) await this.publishCandidate(organizationId, eventName, "TASK", task.id, task.dueAt, schedule, now, metrics)
  }

  private async scanOverdueTasks(organizationId: string, schedule: NotificationSchedule, eventName: NotificationEventName, now: Date, metrics: Record<string, number>) {
    const lowerBound = new Date(now.getTime() - Math.min(schedule.gracePeriodMinutes, OVERDUE_LOOKBACK_MINUTES) * MINUTE)
    const tasks = await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.task.findMany({
      where: { organizationId, dueAt: { gte: lowerBound, lte: now }, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } }, select: { id: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: BATCH_SIZE,
    }))
    metrics.candidateTasks += tasks.length
    for (const task of tasks) if (task.dueAt) await this.publishCandidate(organizationId, eventName, "TASK", task.id, task.dueAt, schedule, now, metrics)
  }

  private async publishCandidate(organizationId: string, eventName: NotificationEventName, aggregateType: string, aggregateId: string, sourceAt: Date, schedule: NotificationSchedule, now: Date, metrics: Record<string, number>) {
    const triggerAt = scheduledAt(sourceAt, schedule.offsetMinutes)
    if (!isDue(triggerAt, now, schedule.gracePeriodMinutes)) { metrics.eventsSkipped += 1; return }
    const key = scheduledOccurrenceKey(eventName, aggregateId, sourceAt, schedule.offsetMinutes)
    try {
      const result = await this.core.publishAndEvaluate({ organizationId, eventName, aggregateType, aggregateId, actorId: null, occurredAt: triggerAt, idempotencyKey: key, payload: { schedule: { offsetMinutes: schedule.offsetMinutes, scheduledAt: triggerAt.toISOString(), detectedAt: now.toISOString() } } })
      if (result.duplicate) metrics.duplicates += 1
      else metrics.eventsPublished += 1
    } catch (error) { metrics.errors += 1; this.safeError(aggregateType, aggregateId, organizationId, eventName, error) }
  }

  private enabled() { return !["false", "0", "off"].includes((process.env.NOTIFICATION_SCHEDULER_ENABLED ?? "true").toLowerCase()) }
  private intervalMinutes() { const value = Number(process.env.NOTIFICATION_SCHEDULER_INTERVAL_MINUTES ?? 5); return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 5 }
  private safeError(entityType: string, entityId: string, organizationId: string, eventName: string | undefined, error: unknown) { this.logger.error(JSON.stringify({ event: "scheduler.entity.failed", organizationId, entityType, entityId, eventName, errorCategory: error instanceof Error ? error.name : "UNKNOWN" })) }
}
