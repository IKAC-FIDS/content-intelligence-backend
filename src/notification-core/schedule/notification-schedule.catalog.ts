import { NotificationScheduleTriggerMode, NotificationScheduleType } from "@prisma/client"

export type NotificationScheduleDefinition = {
  eventName: string
  label: string
  aggregateType: "MEETING" | "TASK"
  sourceField: "meeting.startAt" | "task.dueAt"
  scheduleType: NotificationScheduleType
  triggerModes: NotificationScheduleTriggerMode[]
  suggestedOffsetsMinutes: number[]
  defaultGracePeriodMinutes: number
}

export const NOTIFICATION_SCHEDULE_CATALOG: Record<string, NotificationScheduleDefinition> = {
  "MEETING.REMINDER": {
    eventName: "MEETING.REMINDER", label: "یادآوری جلسه", aggregateType: "MEETING",
    sourceField: "meeting.startAt", scheduleType: NotificationScheduleType.RELATIVE,
    triggerModes: [NotificationScheduleTriggerMode.BEFORE],
    suggestedOffsetsMinutes: [-10080, -1440, -120, -60, -30, -15], defaultGracePeriodMinutes: 30,
  },
  "TASK.DUE_SOON": {
    eventName: "TASK.DUE_SOON", label: "نزدیک‌شدن سررسید کار", aggregateType: "TASK",
    sourceField: "task.dueAt", scheduleType: NotificationScheduleType.RELATIVE,
    triggerModes: [NotificationScheduleTriggerMode.BEFORE],
    suggestedOffsetsMinutes: [-1440, -720, -360, -120, -60, -30, -15], defaultGracePeriodMinutes: 60,
  },
  "TASK.OVERDUE": {
    eventName: "TASK.OVERDUE", label: "سررسید گذشته کار", aggregateType: "TASK",
    sourceField: "task.dueAt", scheduleType: NotificationScheduleType.OVERDUE,
    triggerModes: [NotificationScheduleTriggerMode.AT_OR_AFTER],
    suggestedOffsetsMinutes: [0], defaultGracePeriodMinutes: 525600,
  },
}

export function scheduleDefinition(eventName: string) { return NOTIFICATION_SCHEDULE_CATALOG[eventName] }
