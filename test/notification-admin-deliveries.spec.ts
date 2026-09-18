import { NotificationAdminService } from "../src/notification-core/notification-admin.service"

describe("NotificationAdminService delivery center", () => {
  const user = { userId: "admin-1", tenantContext: { tenantId: "org-1", organizationId: "org-1", userId: "admin-1", membershipId: "membership-1", membershipStatus: "active", resolutionSource: "token-session", tenantRole: "ADMIN", permissions: ["notification:manage"], platformAdmin: false } }

  it("returns a safe detail contract without raw payload or template body", async () => {
    const item = {
      id: "delivery-1", channel: "EMAIL", status: "FAILED", destination: "person@example.com", deduplicationKey: "1234567890abcdefghijklmnop",
      attemptCount: 1, providerMessageId: null, failureCode: "HTTP_503", failureMessage: "token=secret-value", lastAttemptAt: null, nextAttemptAt: null, processingStartedAt: null, retryRequestedAt: null, sentAt: null, deliveredAt: null, createdAt: new Date(), updatedAt: new Date(),
      event: { id: "event-1", eventName: "TASK.ASSIGNED", aggregateType: "Task", aggregateId: "task-1", actorId: "actor-1", occurredAt: new Date(), payload: { private: "must-not-leak", schedule: { offsetMinutes: 10, secret: "no" } }, actor: { id: "actor-1", fullName: "Actor" } },
      recipientUser: { id: "user-1", fullName: "User", email: "person@example.com" }, retryRequestedBy: null, rule: { id: "rule-1", name: "Rule" }, template: { id: "template-1", eventName: "TASK.ASSIGNED", channel: "EMAIL", locale: "fa-IR", version: 2 }, attempts: [],
    }
    const tx = { notificationDelivery: { findFirst: jest.fn().mockResolvedValue(item) } }
    const prisma = { withTenantTransaction: jest.fn(async (_context, callback) => callback(tx)) }
    const service = new NotificationAdminService(prisma as never, {} as never, {} as never, {} as never)
    const result = await service.getDelivery("delivery-1", user as never)
    expect(tx.notificationDelivery.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "delivery-1", organizationId: "org-1" } }))
    expect(result.destination).toBe("p***@example.com")
    expect(result.failureMessage).not.toContain("secret-value")
    expect(result.event.payload).toBeUndefined()
    expect(result.event.schedule).toEqual({ offsetMinutes: 10 })
    expect(result.template).not.toHaveProperty("body")
  })
})
