import { NotificationChannel, NotificationDeliveryStatus, NotificationPriority } from "@prisma/client"
import { NotificationOrchestrationService } from "../src/notification-core/orchestration/notification-orchestration.service"

const event = { id: "event-1", organizationId: "org-1", eventName: "TASK.OVERDUE", aggregateType: "TASK", aggregateId: "task-1", actorId: null, payload: {}, idempotencyKey: "source-1", occurredAt: new Date("2026-09-10T20:30:00Z"), createdAt: new Date() } as never
const rule = (patch = {}) => ({ mandatory: false, deliveryPriority: NotificationPriority.NORMAL, digestPolicyId: null, ...patch })

describe("NotificationOrchestrationService", () => {
  const service = new NotificationOrchestrationService()
  it("applies user preferences before delivery", async () => {
    const db = { notificationPreference: { findUnique: jest.fn().mockResolvedValue({ enabled: false }) } }
    const result = await service.decide(event, rule(), "user-1", NotificationChannel.EMAIL, db as never)
    expect(result).toMatchObject({ disposition: "SUPPRESSED_PREFERENCE", status: NotificationDeliveryStatus.SKIPPED })
  })
  it("defers a normal SMS during cross-midnight quiet hours", async () => {
    const db = { notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) }, notificationQuietHoursPolicy: { findUnique: jest.fn().mockResolvedValue({ enabled: true, channels: [NotificationChannel.SMS], startTime: "22:00", endTime: "07:00", timezone: "Asia/Tehran", allowCritical: true, mode: "DEFER" }) } }
    const result = await service.decide(event, rule(), "user-1", NotificationChannel.SMS, db as never, new Date("2026-09-10T20:30:00Z"))
    expect(result.disposition).toBe("DEFERRED_QUIET_HOURS")
    expect(result.nextAttemptAt?.toISOString()).toBe("2026-09-11T03:30:00.000Z")
  })
  it("lets CRITICAL notifications bypass quiet hours", async () => {
    const db = { notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) }, notificationQuietHoursPolicy: { findUnique: jest.fn().mockResolvedValue({ enabled: true, channels: [NotificationChannel.SMS], startTime: "22:00", endTime: "07:00", timezone: "Asia/Tehran", allowCritical: true, mode: "DEFER" }) } }
    const result = await service.decide(event, rule({ deliveryPriority: NotificationPriority.CRITICAL }), "user-1", NotificationChannel.SMS, db as never, new Date("2026-09-10T20:30:00Z"))
    expect(result.disposition).toBe("DIRECT")
  })
  it("defers CRITICAL when the organization disables critical bypass", async () => {
    const db = { notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) }, notificationQuietHoursPolicy: { findUnique: jest.fn().mockResolvedValue({ enabled: true, channels: [NotificationChannel.SMS], startTime: "22:00", endTime: "07:00", timezone: "Asia/Tehran", allowCritical: false, mode: "DEFER" }) } }
    const result = await service.decide(event, rule({ deliveryPriority: NotificationPriority.CRITICAL }), "user-1", NotificationChannel.SMS, db as never, new Date("2026-09-10T20:30:00Z"))
    expect(result.disposition).toBe("DEFERRED_QUIET_HOURS")
  })
  it("places explicitly eligible email in a daily digest", async () => {
    const db = { notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) }, notificationQuietHoursPolicy: { findUnique: jest.fn().mockResolvedValue(null) }, notificationDigestPolicy: { findFirst: jest.fn().mockResolvedValue({ id: "digest-1", sendTime: "09:00", timezone: "Asia/Tehran" }) } }
    const result = await service.decide(event, rule({ digestPolicyId: "digest-1" }), "user-1", NotificationChannel.EMAIL, db as never, new Date("2026-09-10T06:00:00Z"))
    expect(result).toMatchObject({ disposition: "DIGESTED", digest: { policyId: "digest-1" } })
  })
})
