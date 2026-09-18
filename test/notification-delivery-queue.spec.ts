import { NotificationDeliveryStatus as Status } from "@prisma/client"
import { NotificationDeliveryQueueService } from "../src/notification-core/queue/notification-delivery-queue.service"
import { NotificationDeliveryWorkerService } from "../src/notification-core/queue/notification-delivery-worker.service"

describe("Notification delivery durable queue", () => {
  afterEach(() => {
    delete process.env.NOTIFICATION_RETRY_MAX_ATTEMPTS
    delete process.env.NOTIFICATION_RETRY_BASE_DELAY_SECONDS
  })

  it("moves a temporary provider failure to RETRYING with exponential backoff", async () => {
    process.env.NOTIFICATION_RETRY_BASE_DELAY_SECONDS = "10"
    const update = jest.fn().mockResolvedValue({ status: Status.RETRYING })
    const tx = { notificationDelivery: { findFirst: jest.fn().mockResolvedValue({ id: "delivery-1", attemptCount: 2, failureMessage: "SMTP unavailable" }), update } }
    const prisma = { withTenantTransaction: jest.fn(async (_context, callback) => callback(tx)) }
    const queue = new NotificationDeliveryQueueService(prisma as never)
    const before = Date.now()
    await queue.handleFailure("delivery-1", "org-1", "EMAIL_DISPATCH_ERROR")
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: Status.RETRYING, failureCode: "EMAIL_DISPATCH_ERROR" }) }))
    const next = update.mock.calls[0][0].data.nextAttemptAt as Date
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 20_000)
  })

  it("keeps an exhausted job FAILED", async () => {
    process.env.NOTIFICATION_RETRY_MAX_ATTEMPTS = "3"
    const update = jest.fn().mockResolvedValue({ status: Status.FAILED })
    const tx = { notificationDelivery: { findFirst: jest.fn().mockResolvedValue({ id: "delivery-1", attemptCount: 3, failureMessage: "down" }), update } }
    const prisma = { withTenantTransaction: jest.fn(async (_context, callback) => callback(tx)) }
    await new NotificationDeliveryQueueService(prisma as never).handleFailure("delivery-1", "org-1")
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: Status.FAILED, nextAttemptAt: null, failureCode: "RETRY_EXHAUSTED" }) }))
  })

  it("allows an administrator to start a fresh retry cycle for a failed job", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const findFirstOrThrow = jest.fn().mockResolvedValue({ id: "delivery-1", status: Status.RETRYING })
    const tx = { notificationDelivery: { findFirst: jest.fn().mockResolvedValue({ id: "delivery-1" }), updateMany, findFirstOrThrow } }
    const prisma = { withTenantTransaction: jest.fn(async (_context, callback) => callback(tx)) }
    await new NotificationDeliveryQueueService(prisma as never).retryNow("delivery-1", "org-1", "admin-1")
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: Status.FAILED }), data: expect.objectContaining({ status: Status.RETRYING, retryRequestedById: "admin-1" }) }))
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty("attemptCount")
  })

  it("rejects a concurrent or ineligible retry without creating another delivery", async () => {
    const create = jest.fn()
    const tx = { notificationDelivery: { findFirst: jest.fn().mockResolvedValue({ id: "delivery-1" }), updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirstOrThrow: jest.fn(), create } }
    const prisma = { withTenantTransaction: jest.fn(async (_context, callback) => callback(tx)) }
    await expect(new NotificationDeliveryQueueService(prisma as never).retryNow("delivery-1", "org-1", "admin-1")).rejects.toThrow("فقط ارسال ناموفق")
    expect(create).not.toHaveBeenCalled()
  })

  it("recovers stale PROCESSING jobs before dispatching due jobs", async () => {
    const queue = { recoverStale: jest.fn().mockResolvedValue({ count: 1 }), due: jest.fn().mockResolvedValue([{ id: "delivery-1" }]) }
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({ status: Status.SENT, sent: true }) }
    const worker = new NotificationDeliveryWorkerService({} as never, queue as never, dispatcher as never)
    await expect(worker.processOrganization("org-1", new Date())).resolves.toEqual({ queued: 1, rejected: 0, recovered: 1 })
    expect(dispatcher.dispatch).toHaveBeenCalledWith("delivery-1", "org-1")
  })
})
