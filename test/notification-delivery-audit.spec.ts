import { NotificationDeliveryStatus, NotificationFailureCategory, NotificationTriggerType } from "@prisma/client"
import { NotificationDeliveryAuditService } from "../src/notification-core/audit/notification-delivery-audit.service"

describe("NotificationDeliveryAuditService", () => {
  it("records a sanitized manual retry attempt on the same delivery", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 })
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const tx = { notificationDelivery: { findFirst: jest.fn().mockResolvedValue({ id: "delivery-1", channel: "EMAIL", attemptCount: 2, lastAttemptAt: new Date(), providerMessageId: null, failureCode: "HTTP_503", failureMessage: "Bearer secret-token apiKey=hidden" }), updateMany }, notificationDeliveryAttempt: { createMany } }
    const prisma = { withTenantTransaction: jest.fn(async (_context, callback) => callback(tx)) }
    const service = new NotificationDeliveryAuditService(prisma as never)
    await service.record("delivery-1", "org-1", { status: NotificationDeliveryStatus.RETRYING, attemptCount: 1, retryRequestedById: "admin-1", event: { actorId: "actor-1", payload: {} } }, NotificationDeliveryStatus.FAILED)
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deliveryId: "delivery-1", attemptNumber: 2, triggerType: NotificationTriggerType.MANUAL_RETRY, triggeredByUserId: "admin-1", failureCategory: NotificationFailureCategory.NETWORK, failureReason: expect.not.stringContaining("secret-token") }) }))
    expect(updateMany).toHaveBeenCalled()
  })

  it("categorizes a later retry without an administrator as automatic", async () => {
    const service = new NotificationDeliveryAuditService({} as never)
    expect((service as unknown as { triggerType: (value: unknown) => NotificationTriggerType }).triggerType({ status: NotificationDeliveryStatus.RETRYING, attemptCount: 1, retryRequestedById: null, event: { actorId: "actor-1", payload: {} } })).toBe(NotificationTriggerType.AUTOMATIC_RETRY)
  })
})
