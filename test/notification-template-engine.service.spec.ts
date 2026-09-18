import { BadRequestException, NotFoundException } from "@nestjs/common"
import { NotificationChannel, type NotificationEvent } from "@prisma/client"
import { NotificationTemplateEngineService } from "../src/notification-core/notification-template-engine.service"

const organizationId = "00000000-0000-4000-8000-000000000001"
const event = {
  id: "event-1", organizationId, eventName: "MEETING.CREATED", aggregateType: "MEETING",
  aggregateId: "meeting-1", actorId: "actor-1", payload: {}, idempotencyKey: null,
  occurredAt: new Date(), createdAt: new Date(),
} as NotificationEvent

function setup() {
  const prisma = {
    notificationTemplate: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    meeting: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
  }
  return { prisma, service: new NotificationTemplateEngineService(prisma as never) }
}

describe("NotificationTemplateEngineService", () => {
  it("resolves nested variables and renders EMAIL subject", () => {
    const { service } = setup()
    const result = service.render({
      subject: "جلسه {{meeting.title}}", body: "سلام {{user.fullName}}؛ {{meeting.company.name}}",
      context: { user: { fullName: "علی" }, meeting: { title: "دمو", company: { name: "نشان" } } },
    })
    expect(result).toEqual({ subject: "جلسه دمو", body: "سلام علی؛ نشان", missingVariables: [] })
  })

  it("renders recipient-specific content", () => {
    const { service } = setup()
    const first = service.render({ body: "سلام {{user.fullName}}", context: { user: { fullName: "علی" } } })
    const second = service.render({ body: "سلام {{user.fullName}}", context: { user: { fullName: "مریم" } } })
    expect(first.body).toBe("سلام علی")
    expect(second.body).toBe("سلام مریم")
  })

  it("renders all catalog date variables with the Persian calendar and Tehran time", () => {
    const { service } = setup()
    const timestamp = new Date("2026-09-10T08:30:00.000Z")
    const expected = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp)
    const result = service.render({ body: "شروع: {{meeting.startAt}} | پایان: {{meeting.endAt}}", context: { meeting: { startAt: timestamp, endAt: timestamp.toISOString() } } })
    expect(result.body).toBe(`شروع: ${expected} | پایان: ${expected}`)
    expect(result.body).not.toContain("2026-09-10")
  })

  it("keeps missing placeholders and reports them", () => {
    const { service } = setup()
    expect(service.render({ body: "{{meeting.location}}", context: { meeting: {} } })).toEqual({
      subject: null, body: "{{meeting.location}}", missingVariables: ["meeting.location"],
    })
  })

  it.each(["{{user.password}}", "{{foo.bar}}", "{{__proto__.x}}", "{{constructor.name}}"])(
    "rejects invalid or dangerous variable %s", (body) => {
      const { service } = setup()
      expect(() => service.validate("MEETING.CREATED", null, body)).toThrow(BadRequestException)
    },
  )

  it("resolves the newest active template inside the tenant", async () => {
    const { prisma, service } = setup()
    prisma.notificationTemplate.findFirst.mockResolvedValue({ id: "template-2", version: 2 })
    await expect(service.resolve(organizationId, "MEETING.CREATED", NotificationChannel.EMAIL, "fa-IR"))
      .resolves.toMatchObject({ id: "template-2" })
    expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId, eventName: "MEETING.CREATED", channel: "EMAIL", locale: "fa-IR", isActive: true },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    }))
  })

  it("returns a controlled error when no active template exists", async () => {
    const { prisma, service } = setup()
    prisma.notificationTemplate.findFirst.mockResolvedValue(null)
    await expect(service.resolve(organizationId, "MEETING.CREATED", NotificationChannel.SMS, "fa-IR"))
      .rejects.toThrow(NotFoundException)
  })

  it("builds tenant-scoped context and links the exact template", async () => {
    const { prisma, service } = setup()
    prisma.organization.findUnique.mockResolvedValue({ id: organizationId, name: "نشان", locale: "fa-IR" })
    prisma.notificationTemplate.findFirst.mockResolvedValue({ id: "template-1", subject: null, body: "سلام {{user.fullName}}؛ {{meeting.company.name}}", version: 1 })
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: "recipient-1", fullName: "علی", email: "a@example.com" })
      .mockResolvedValueOnce({ id: "actor-1", fullName: "مدیر" })
    prisma.meeting.findFirst.mockResolvedValue({ id: "meeting-1", title: "جلسه", startAt: new Date(), endAt: new Date(), location: null, agenda: null, company: { id: "company-1", legalName: "شرکت حقوقی", brandName: "برند شرکت" } })
    const result = await service.renderDelivery(event, "recipient-1", NotificationChannel.SMS)
    expect(result.body).toBe("سلام علی؛ برند شرکت")
    expect(result.template.id).toBe("template-1")
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "recipient-1", organizationMemberships: { some: { organizationId, status: 'ACTIVE' } }, isActive: true } }))
    expect(prisma.meeting.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "meeting-1", organizationId } }))
    expect(prisma.meeting.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ company: { select: { id: true, legalName: true, brandName: true } } }),
    }))
  })
})
