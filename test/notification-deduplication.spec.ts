import { BadRequestException } from "@nestjs/common"
import { NotificationChannel, Prisma } from "@prisma/client"
import { NotificationDeduplicationKeyService } from "../src/notification-core/deduplication/notification-deduplication-key.service"
import { NotificationDeliveryService } from "../src/notification-core/deduplication/notification-delivery.service"
import { NotificationRuleEngineService } from "../src/notification-core/notification-rule-engine.service"

const identity = { organizationId: "org-a", eventOccurrenceKey: "MEETING.CREATED:meeting-1", recipientUserId: "user-1", channel: NotificationChannel.EMAIL }

describe("Notification delivery deduplication", () => {
  const keys = new NotificationDeduplicationKeyService()

  it("builds a deterministic versioned SHA-256 identity", () => {
    const first = keys.build(identity)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(keys.build({ ...identity })).toBe(first)
    expect(keys.version).toBe("v1")
  })

  it.each([
    ["recipient", { ...identity, recipientUserId: "user-2" }],
    ["channel", { ...identity, channel: NotificationChannel.IN_APP }],
    ["tenant", { ...identity, organizationId: "org-b" }],
    ["occurrence", { ...identity, eventOccurrenceKey: "MEETING.CREATED:meeting-2" }],
  ])("separates identities by %s", (_name, changed) => expect(keys.build(changed)).not.toBe(keys.build(identity)))

  it("separates 24h, 1h and rescheduled reminder occurrences", () => {
    const common = { organizationId: "org-a", recipientUserId: "user-1", channel: NotificationChannel.PUSH }
    const day = keys.build({ ...common, eventOccurrenceKey: "MEETING.REMINDER:meeting-1:2026-09-20T10:00:00.000Z:OFFSET:-1440" })
    const hour = keys.build({ ...common, eventOccurrenceKey: "MEETING.REMINDER:meeting-1:2026-09-20T10:00:00.000Z:OFFSET:-60" })
    const rescheduled = keys.build({ ...common, eventOccurrenceKey: "MEETING.REMINDER:meeting-1:2026-09-21T10:00:00.000Z:OFFSET:-60" })
    expect(new Set([day, hour, rescheduled])).toHaveProperty("size", 3)
  })

  it("handles long canonical inputs without growing the stored key", () => {
    expect(keys.build({ ...identity, eventOccurrenceKey: `TASK.DUE_SOON:${"x".repeat(10_000)}` })).toHaveLength(64)
  })

  it.each([
    [{ ...identity, recipientUserId: "" }, "recipientUserId"],
    [{ ...identity, eventOccurrenceKey: "" }, "eventOccurrenceKey"],
  ])("fails closed when a required identity is absent", (value, field) => expect(() => keys.build(value)).toThrow(field))

  it("rejects legacy events without a logical occurrence identity", () => {
    expect(() => keys.eventOccurrence({ idempotencyKey: null })).toThrow(BadRequestException)
  })

  it("returns the existing delivery when a concurrent insert loses", async () => {
    const delivery = { id: "delivery-existing" }
    const db = { notificationDelivery: { createMany: jest.fn().mockResolvedValue({ count: 0 }), findUniqueOrThrow: jest.fn().mockResolvedValue(delivery) } }
    const result = await new NotificationDeliveryService(keys).createPendingDelivery({ event: { id: "event-1", organizationId: "org-a", eventName: "MEETING.CREATED", idempotencyKey: identity.eventOccurrenceKey } as never, recipientUserId: "user-1", channel: NotificationChannel.EMAIL }, db as never)
    expect(result).toEqual({ status: "DUPLICATE", delivery })
  })

  it("handles a Prisma unique conflict as a duplicate rather than a failure", async () => {
    const delivery = { id: "delivery-existing" }
    const conflict = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5.22.0" })
    const db = { notificationDelivery: { createMany: jest.fn().mockRejectedValue(conflict), findUniqueOrThrow: jest.fn().mockResolvedValue(delivery) } }
    await expect(new NotificationDeliveryService(keys).createPendingDelivery({ event: { id: "event-1", organizationId: "org-a", eventName: "TASK.OVERDUE", idempotencyKey: "TASK.OVERDUE:task-1:2026-09-10T00:00:00.000Z" } as never, recipientUserId: "user-1", channel: NotificationChannel.IN_APP }, db as never)).resolves.toEqual({ status: "DUPLICATE", delivery })
  })

  it("collapses overlapping USER, TEAM and ROLE rules to one user/channel delivery", async () => {
    const stored = new Map<string, any>()
    const recipientRules = [
      { id: "direct", type: "USER", targetId: "user-1", channels: [NotificationChannel.EMAIL], enabled: true },
      { id: "team", type: "TEAM", targetId: "team-1", channels: [NotificationChannel.EMAIL], enabled: true },
      { id: "role", type: "ROLE", targetId: "role-1", channels: [NotificationChannel.EMAIL], enabled: true },
    ]
    const db = {
      notificationRule: { findMany: jest.fn().mockResolvedValue(recipientRules.map((recipientRule, index) => ({ id: `rule-${index}`, conditions: null, schedule: null, recipientRules: [recipientRule] }))) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: "user-1" }]) },
      notificationDelivery: {
        createMany: jest.fn(async ({ data }) => { if (stored.has(data.deduplicationKey)) return { count: 0 }; stored.set(data.deduplicationKey, { id: "delivery-1", ...data }); return { count: 1 } }),
        findUniqueOrThrow: jest.fn(async ({ where }) => stored.get(where.organizationId_deduplicationKey.deduplicationKey)),
      },
    }
    const templates = { renderDelivery: jest.fn().mockResolvedValue({ template: { id: "template-1" } }) }
    const policies = { hasConditions: jest.fn().mockReturnValue(false) }
    const engine = new NotificationRuleEngineService(db as never, templates as never, {} as never, policies as never, new NotificationDeliveryService(keys))
    const result = await engine.evaluateEvent({ id: "event-1", organizationId: "org-a", eventName: "MEETING.CREATED", idempotencyKey: "MEETING.CREATED:meeting-1" } as never, db as never)
    expect(result).toMatchObject({ created: 1, duplicate: 2, matchedRules: 3 })
    expect(stored).toHaveProperty("size", 1)
  })
})
