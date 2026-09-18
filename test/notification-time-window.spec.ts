import { dailyDigestWindow, quietHoursDecision } from "../src/notification-core/orchestration/notification-time-window"

describe("notification time windows", () => {
  it("handles quiet hours that cross midnight in the configured timezone", () => {
    const during = quietHoursDecision(new Date("2026-09-10T20:30:00.000Z"), "22:00", "07:00", "Asia/Tehran")
    expect(during.active).toBe(true)
    expect(during.resumeAt?.toISOString()).toBe("2026-09-11T03:30:00.000Z")
    expect(quietHoursDecision(new Date("2026-09-10T10:00:00.000Z"), "22:00", "07:00", "Asia/Tehran").active).toBe(false)
  })

  it("uses the next local daily window after today's digest time", () => {
    const result = dailyDigestWindow(new Date("2026-09-10T06:00:00.000Z"), "09:00", "Asia/Tehran")
    expect(result.scheduledFor.toISOString()).toBe("2026-09-11T05:30:00.000Z")
  })

  it("keeps the local end time across a daylight-saving transition", () => {
    const result = quietHoursDecision(new Date("2026-03-28T22:30:00.000Z"), "22:00", "07:00", "Europe/Berlin")
    expect(result.active).toBe(true)
    expect(result.resumeAt?.toISOString()).toBe("2026-03-29T05:00:00.000Z")
  })

  it("treats equal start and end as a full-day quiet window", () => {
    expect(quietHoursDecision(new Date("2026-09-10T10:00:00.000Z"), "08:00", "08:00", "Asia/Tehran").active).toBe(true)
  })
})
