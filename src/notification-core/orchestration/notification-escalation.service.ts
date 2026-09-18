import { Injectable, Logger } from "@nestjs/common"
import { NotificationEscalationRunStatus, NotificationPriority, TaskStatus, type NotificationEvent } from "@prisma/client"
import { PrismaService, type TenantTransactionClient } from "../../prisma/prisma.service"
import { notificationTenantContext } from "../in-app/notification-tenant-context"
import { NotificationDeliveryService } from "../deduplication/notification-delivery.service"
import { NotificationRuleEngineService } from "../notification-rule-engine.service"
import { NotificationTemplateEngineService } from "../notification-template-engine.service"
import { NotificationPolicyContextBuilder } from "../policy/notification-policy-context-builder.service"
import { NotificationPolicyEvaluatorService } from "../policy/notification-policy-evaluator.service"
import { NotificationOrchestrationService } from "./notification-orchestration.service"

@Injectable()
export class NotificationEscalationService {
  private readonly logger = new Logger(NotificationEscalationService.name)
  constructor(private readonly prisma: PrismaService, private readonly rules: NotificationRuleEngineService, private readonly templates: NotificationTemplateEngineService, private readonly deliveries: NotificationDeliveryService, private readonly contextBuilder: NotificationPolicyContextBuilder, private readonly evaluator: NotificationPolicyEvaluatorService, private readonly orchestration: NotificationOrchestrationService) {}

  async register(event: NotificationEvent, db: TenantTransactionClient) {
    const policies = await db.notificationEscalationPolicy.findMany({ where: { organizationId: event.organizationId, enabled: true, eventName: event.eventName, aggregateType: event.aggregateType }, include: { steps: true } })
    const context = policies.some(policy => this.evaluator.hasConditions(policy.conditions)) ? await this.contextBuilder.build(event, db) : null
    const sourceDueAt = await this.sourceDueAt(event, db)
    for (const policy of policies) {
      if (context && !this.evaluator.evaluate(policy.conditions, context).matches) continue
      for (const step of policy.steps) await db.notificationEscalationRun.createMany({ data: [{ organizationId: event.organizationId, policyId: policy.id, stepId: step.id, sourceEventId: event.id, aggregateType: event.aggregateType, aggregateId: event.aggregateId, sourceDueAt, scheduledFor: new Date(event.occurredAt.getTime() + step.delayMinutes * 60_000) }], skipDuplicates: true })
    }
  }

  async processOrganization(organizationId: string, now = new Date()) {
    const context = notificationTenantContext(organizationId)
    const runs = await this.prisma.withTenantTransaction(context, tx => tx.notificationEscalationRun.findMany({ where: { organizationId, status: NotificationEscalationRunStatus.PENDING, scheduledFor: { lte: now } }, include: { policy: true, step: true }, orderBy: { scheduledFor: "asc" }, take: 100 }))
    let sent = 0, resolved = 0
    for (const run of runs) {
      try {
        const claim = await this.prisma.withTenantTransaction(context, tx => tx.notificationEscalationRun.updateMany({ where: { id: run.id, organizationId, status: NotificationEscalationRunStatus.PENDING }, data: { status: NotificationEscalationRunStatus.PROCESSING } }))
        if (!claim.count) continue
        if (!(await this.isStillActionable(run.aggregateType, run.aggregateId, run.sourceDueAt, organizationId))) {
          await this.prisma.withTenantTransaction(context, tx => tx.notificationEscalationRun.update({ where: { id: run.id }, data: { status: NotificationEscalationRunStatus.CANCELLED_RESOLVED, resolvedAt: now } })); resolved += 1; continue
        }
        await this.prisma.withTenantTransaction(context, async tx => {
          const source = await tx.notificationEvent.findFirstOrThrow({ where: { id: run.sourceEventId, organizationId } })
          const event = await tx.notificationEvent.create({ data: { organizationId, eventName: source.eventName, aggregateType: source.aggregateType, aggregateId: source.aggregateId, actorId: null, occurredAt: now, idempotencyKey: `ESCALATION:${run.id}`, payload: { escalation: { runId: run.id, step: run.step.stepOrder, sourceEventId: source.id } } } })
          const recipientIds = await this.rules.resolveRecipientIds(event, { type: run.step.recipientType, targetId: run.step.targetId }, tx)
          for (const recipientUserId of recipientIds) for (const channel of run.step.channels) {
            const rendered = await this.templates.renderDelivery(event, recipientUserId, channel, tx)
            const priority = run.step.priority ?? NotificationPriority.HIGH
            const decision = await this.orchestration.decide(event, { mandatory: run.step.mandatory, deliveryPriority: priority, digestPolicyId: null }, recipientUserId, channel, tx, now)
            await this.deliveries.createPendingDelivery({ event, recipientUserId, templateId: rendered.template.id, channel, priority, escalationRunId: run.id, decision }, tx)
          }
          await tx.notificationEscalationRun.update({ where: { id: run.id }, data: { status: NotificationEscalationRunStatus.SENT } })
        }); sent += 1
      } catch (error) { await this.prisma.withTenantTransaction(context, tx => tx.notificationEscalationRun.updateMany({ where: { id: run.id, organizationId }, data: { status: NotificationEscalationRunStatus.FAILED } })); this.logger.error(JSON.stringify({ event: "notification.escalation.failed", organizationId, runId: run.id, category: error instanceof Error ? error.name : "UNKNOWN" })) }
    }
    return { candidates: runs.length, sent, resolved }
  }

  private async sourceDueAt(event: NotificationEvent, db: TenantTransactionClient) { if (event.aggregateType !== "TASK") return null; const task = await db.task.findFirst({ where: { id: event.aggregateId, organizationId: event.organizationId }, select: { dueAt: true } }); return task?.dueAt ?? null }
  private async isStillActionable(type: string, id: string, dueAt: Date | null, organizationId: string) { if (type !== "TASK") return true; const task = await this.prisma.withTenantTransaction(notificationTenantContext(organizationId), tx => tx.task.findFirst({ where: { id, organizationId }, select: { status: true, dueAt: true } })); return Boolean(task && (task.status === TaskStatus.TODO || task.status === TaskStatus.IN_PROGRESS) && (!dueAt || task.dueAt?.getTime() === dueAt.getTime())) }
}
