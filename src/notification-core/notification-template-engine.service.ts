import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { NotificationChannel, type NotificationEvent, type NotificationTemplate } from "@prisma/client"
import { PrismaService, type TenantTransactionClient } from "../prisma/prisma.service"
import {
  NOTIFICATION_TEMPLATE_VARIABLES,
  type NotificationEventName,
  type NotificationTemplateVariable,
} from "./notification-core.catalog"

type TemplateContext = Record<string, unknown>
type RenderInput = { subject?: string | null; body: string; context: TemplateContext }
const PLACEHOLDER = /{{\s*([^{}]+?)\s*}}/g
const SAFE_PATH = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/
const DANGEROUS_SEGMENTS = new Set(["__proto__", "prototype", "constructor"])
const DATE_VARIABLE_PATHS = new Set(
  Object.values(NOTIFICATION_TEMPLATE_VARIABLES)
    .flat()
    .filter((item) => item.type === "date")
    .map((item) => item.key),
)

@Injectable()
export class NotificationTemplateEngineService {
  constructor(private readonly prisma: PrismaService) {}

  variables(eventName: string): NotificationTemplateVariable[] {
    return NOTIFICATION_TEMPLATE_VARIABLES[eventName as NotificationEventName] ?? []
  }

  validate(eventName: string, subject: string | null | undefined, body: string) {
    const allowed = new Set(this.variables(eventName).map((item) => item.key))
    if (!allowed.size) throw new BadRequestException(`Unsupported notification event: ${eventName}`)
    const invalid = this.extract(subject, body).filter(
      (path) => !this.isSafePath(path) || !allowed.has(path),
    )
    if (invalid.length) {
      throw new BadRequestException(`Invalid template variables: ${[...new Set(invalid)].join(", ")}`)
    }
  }

  render(input: RenderInput) {
    const missingVariables = new Set<string>()
    const renderText = (text: string | null | undefined) => {
      if (text == null) return text ?? null
      return text.replace(PLACEHOLDER, (token, rawPath: string) => {
        const path = rawPath.trim()
        if (!this.isSafePath(path)) {
          missingVariables.add(path)
          return token
        }
        const value = this.lookup(input.context, path)
        if (value === undefined || value === null) {
          missingVariables.add(path)
          return token
        }
        return DATE_VARIABLE_PATHS.has(path) ? this.formatPersianDateTime(value) : String(value)
      })
    }
    return {
      subject: renderText(input.subject),
      body: renderText(input.body) ?? "",
      missingVariables: [...missingVariables],
    }
  }

  async resolve(organizationId: string, eventName: string, channel: NotificationChannel, locale: string, db: TenantTransactionClient = this.prisma) {
    const template = await db.notificationTemplate.findFirst({
      where: { organizationId, eventName, channel, locale, isActive: true },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    })
    if (!template) throw new NotFoundException("No active notification template found")
    return template
  }

  async renderDelivery(event: NotificationEvent, recipientUserId: string, channel: NotificationChannel, db: TenantTransactionClient = this.prisma) {
    const organization = await db.organization.findUnique({
      where: { id: event.organizationId }, select: { id: true, name: true, locale: true },
    })
    if (!organization) throw new NotFoundException("Notification organization not found")
    const template = await this.resolve(event.organizationId, event.eventName, channel, organization.locale || "fa-IR", db)
    const context = await this.buildContext(event, recipientUserId, organization, db)
    const rendered = this.render({ subject: template.subject, body: template.body, context })
    return { template, ...rendered }
  }

  async renderStoredTemplate(event: NotificationEvent, recipientUserId: string, template: NotificationTemplate, db: TenantTransactionClient = this.prisma) {
    if (template.organizationId !== event.organizationId || template.eventName !== event.eventName) {
      throw new BadRequestException("Notification template does not match delivery event")
    }
    const organization = await db.organization.findUnique({
      where: { id: event.organizationId }, select: { id: true, name: true, locale: true },
    })
    if (!organization) throw new NotFoundException("Notification organization not found")
    const context = await this.buildContext(event, recipientUserId, organization, db)
    const rendered = this.render({ subject: template.subject, body: template.body, context })
    return {
      ...rendered,
      subject: rendered.subject?.replace(PLACEHOLDER, "—") ?? null,
      body: rendered.body.replace(PLACEHOLDER, "—"),
    }
  }

  preview(eventName: string, subject: string | null | undefined, body: string) {
    this.validate(eventName, subject, body)
    return this.render({ subject, body, context: this.sampleContext(eventName) })
  }

  private async buildContext(
    event: NotificationEvent,
    recipientUserId: string,
    organization: { id: string; name: string; locale: string },
    db: TenantTransactionClient = this.prisma,
  ): Promise<TemplateContext> {
    const [user, actor] = await Promise.all([
      db.user.findFirst({ where: { id: recipientUserId, organizationMemberships: { some: { organizationId: event.organizationId, status: 'ACTIVE' } }, isActive: true }, select: { id: true, fullName: true, email: true } }),
      event.actorId ? db.user.findFirst({ where: { id: event.actorId, organizationMemberships: { some: { organizationId: event.organizationId, status: 'ACTIVE' } } }, select: { id: true, fullName: true } }) : null,
    ])
    if (!user) throw new NotFoundException("Notification recipient not found")
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {}
    const base: TemplateContext = {
      user,
      actor,
      organization: { id: organization.id, name: organization.name },
      schedule: payload.schedule ?? null,
      conversation: event.eventName.startsWith("CONVERSATION.") ? {
        threadId: payload.threadId,
        messageId: payload.messageId,
        entityType: payload.entityType,
        entityId: payload.entityId,
        entityLabel: payload.entityLabel,
        messageType: payload.messageType,
      } : null,
    }
    if (event.aggregateType === "MEETING") {
      const meeting = await db.meeting.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { id: true, title: true, startAt: true, endAt: true, location: true, agenda: true, type: { select: { code: true } }, company: { select: { id: true, legalName: true, brandName: true } } },
      })
      if (!meeting) throw new NotFoundException("Notification meeting not found")
      return {
        ...base,
        meeting: {
          ...meeting,
          type: meeting.type?.code ?? null,
          company: meeting.company
            ? { id: meeting.company.id, name: meeting.company.brandName || meeting.company.legalName }
            : null,
        },
      }
    }
    if (event.aggregateType === "TASK") {
      const task = await db.task.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { id: true, title: true, description: true, dueAt: true, priority: true, assignedTo: { select: { fullName: true } }, opportunity: { select: { title: true } }, company: { select: { id: true, legalName: true, brandName: true } } },
      })
      if (!task) throw new NotFoundException("Notification task not found")
      return {
        ...base,
        task: {
          ...task,
          dueDate: task.dueAt,
          company: task.company
            ? { id: task.company.id, name: task.company.brandName || task.company.legalName }
            : null,
        },
      }
    }
    if (event.aggregateType === "OPPORTUNITY") {
      const opportunity = await db.opportunity.findFirst({
        where: { id: event.aggregateId, organizationId: event.organizationId },
        select: { id: true, title: true, priority: true, probability: true, stage: { select: { code: true } } },
      })
      if (!opportunity) throw new NotFoundException("Notification opportunity not found")
      return { ...base, opportunity: { id: opportunity.id, title: opportunity.title, priority: opportunity.priority, probability: opportunity.probability, stage: opportunity.stage.code, fromStage: typeof payload.fromStage === "string" ? payload.fromStage : null, toStage: typeof payload.toStage === "string" ? payload.toStage : opportunity.stage.code } }
    }
    return base
  }

  private sampleContext(eventName: string): TemplateContext {
    const base = {
      user: { id: "preview-user", fullName: "علی رضایی", email: "ali@example.com" },
      actor: { id: "preview-actor", fullName: "مدیر سامانه" },
      organization: { id: "preview-organization", name: "سازمان نمونه" },
    }
    const schedule = { offsetMinutes: -1440, scheduledAt: "2026-09-11T09:00:00.000Z", detectedAt: "2026-09-11T09:03:00.000Z" }
    if (eventName.startsWith("MEETING.")) return { ...base, schedule, meeting: { id: "preview-meeting", title: "بررسی قرارداد", type: "SALES_MEETING", startAt: "۱۴۰۵/۰۶/۱۵، ۱۰:۰۰", endAt: "۱۴۰۵/۰۶/۱۵، ۱۱:۰۰", location: "اتاق جلسات", agenda: "مرور شرایط قرارداد", company: { id: "preview-company", name: "شرکت نمونه" } } }
    if (eventName.startsWith("TASK.")) return { ...base, schedule, task: { id: "preview-task", title: "پیگیری پیشنهاد", description: "تماس با مشتری", dueAt: "۱۴۰۵/۰۶/۲۰، ۱۲:۰۰", dueDate: "۱۴۰۵/۰۶/۲۰، ۱۲:۰۰", priority: "MEDIUM", assignee: { fullName: "علی رضایی" }, opportunity: { title: "فرصت نمونه" }, company: { id: "preview-company", name: "شرکت نمونه" } } }
    if (eventName.startsWith("OPPORTUNITY.")) return { ...base, opportunity: { id: "preview-opportunity", title: "فرصت نمونه", priority: "HIGH", probability: 80, stage: "WON", fromStage: "QUALIFIED", toStage: "WON" } }
    if (eventName.startsWith("CONVERSATION.")) return { ...base, conversation: { threadId: "preview-thread", messageId: "preview-message", entityType: "TASK", entityId: "preview-task", entityLabel: "پیگیری پیشنهاد", messageType: "QUESTION" } }
    return base
  }

  private extract(...texts: Array<string | null | undefined>) {
    return texts.flatMap((text) => [...(text ?? "").matchAll(PLACEHOLDER)].map((match) => (match[1] ?? "").trim()))
  }

  private isSafePath(path: string) {
    return SAFE_PATH.test(path) && path.split(".").every((segment) => !DANGEROUS_SEGMENTS.has(segment))
  }

  private lookup(context: TemplateContext, path: string): unknown {
    let current: unknown = context
    for (const segment of path.split(".")) {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
      current = (current as Record<string, unknown>)[segment]
    }
    return current
  }

  private formatPersianDateTime(value: unknown) {
    const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null
    if (!parsed || Number.isNaN(parsed.getTime())) return String(value)
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(parsed)
  }
}
