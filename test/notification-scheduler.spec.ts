import { BadRequestException } from "@nestjs/common"
import { NotificationScheduleTriggerMode, NotificationScheduleType } from "@prisma/client"
import { NotificationScheduleValidator } from "../src/notification-core/schedule/notification-schedule-validator.service"
import { isDue, NotificationSchedulerService, scheduledAt, scheduledOccurrenceKey } from "../src/notification-core/schedule/notification-scheduler.service"

describe("scheduled notification timing", () => {
  const source = new Date("2026-09-12T09:00:00.000Z")

  it.each([
    [-1440, "2026-09-11T09:00:00.000Z"],
    [-60, "2026-09-12T08:00:00.000Z"],
    [0, "2026-09-12T09:00:00.000Z"],
  ])("calculates UTC offset %i", (offset, expected) => expect(scheduledAt(source, offset).toISOString()).toBe(expected))

  it("accepts a missed scan inside grace and rejects a stale reminder", () => {
    const trigger = new Date("2026-09-11T09:00:00.000Z")
    expect(isDue(trigger, new Date("2026-09-11T09:07:00.000Z"), 30)).toBe(true)
    expect(isDue(trigger, new Date("2026-09-11T10:00:01.000Z"), 30)).toBe(false)
    expect(isDue(trigger, new Date("2026-09-11T08:59:59.000Z"), 30)).toBe(false)
  })

  it("separates offsets and rescheduled source dates while keeping reruns idempotent", () => {
    const first = scheduledOccurrenceKey("MEETING.REMINDER", "meeting-1", source, -1440)
    expect(scheduledOccurrenceKey("MEETING.REMINDER", "meeting-1", source, -1440)).toBe(first)
    expect(scheduledOccurrenceKey("MEETING.REMINDER", "meeting-1", source, -60)).not.toBe(first)
    expect(scheduledOccurrenceKey("MEETING.REMINDER", "meeting-1", new Date("2026-09-13T09:00:00.000Z"), -1440)).not.toBe(first)
  })
})

describe("NotificationScheduleValidator", () => {
  const validator = new NotificationScheduleValidator()
  it("validates meeting and task schedules from the catalog", () => {
    expect(validator.validate("MEETING.REMINDER", { type: NotificationScheduleType.RELATIVE, sourceField: "meeting.startAt", triggerMode: NotificationScheduleTriggerMode.BEFORE, offsetMinutes: -1440 })?.gracePeriodMinutes).toBe(30)
    expect(validator.validate("TASK.OVERDUE", { type: NotificationScheduleType.OVERDUE, sourceField: "task.dueAt", triggerMode: NotificationScheduleTriggerMode.AT_OR_AFTER, offsetMinutes: 0 })).toBeTruthy()
  })
  it.each([
    ["TASK.ASSIGNED", { type: NotificationScheduleType.RELATIVE, sourceField: "task.dueAt", triggerMode: NotificationScheduleTriggerMode.BEFORE, offsetMinutes: -60 }],
    ["MEETING.REMINDER", { type: NotificationScheduleType.RELATIVE, sourceField: "task.dueAt", triggerMode: NotificationScheduleTriggerMode.BEFORE, offsetMinutes: -60 }],
    ["MEETING.REMINDER", { type: NotificationScheduleType.RELATIVE, sourceField: "meeting.startAt", triggerMode: NotificationScheduleTriggerMode.BEFORE, offsetMinutes: 60 }],
    ["TASK.DUE_SOON", { type: NotificationScheduleType.RELATIVE, sourceField: "task.dueAt", triggerMode: NotificationScheduleTriggerMode.BEFORE, offsetMinutes: -525601 }],
  ])("rejects invalid configuration", (eventName, schedule) => expect(() => validator.validate(eventName, schedule)).toThrow(BadRequestException))
  it("keeps event-driven rules scheduleless", () => expect(validator.validate("TASK.ASSIGNED", null)).toBeNull())
  it("requires schedule for scheduled events", () => expect(() => validator.validate("TASK.DUE_SOON", null)).toThrow(BadRequestException))
})

describe("NotificationSchedulerService controls", () => {
  it("does no work when the scheduler is disabled", async () => {
    const previous = process.env.NOTIFICATION_SCHEDULER_ENABLED
    process.env.NOTIFICATION_SCHEDULER_ENABLED = "false"
    const prisma = { organization: { findMany: jest.fn() } }
    const scheduler = new NotificationSchedulerService(prisma as never, {} as never)
    await scheduler.tick()
    expect(prisma.organization.findMany).not.toHaveBeenCalled()
    if (previous === undefined) delete process.env.NOTIFICATION_SCHEDULER_ENABLED
    else process.env.NOTIFICATION_SCHEDULER_ENABLED = previous
  })
})
