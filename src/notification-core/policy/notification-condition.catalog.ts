import type { NotificationConditionEventDefinition, NotificationConditionFieldDefinition, NotificationConditionOperator } from "./notification-policy.types"

const equality: NotificationConditionOperator[] = ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS"]
const numeric: NotificationConditionOperator[] = ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS", "GT", "GTE", "LT", "LTE"]
const taskFields: NotificationConditionFieldDefinition[] = [
  { field: "task.priority", label: "اولویت کار", type: "enum", operators: equality, values: ["LOW", "MEDIUM", "HIGH", "URGENT"], control: "select" },
  { field: "task.status", label: "وضعیت کار", type: "enum", operators: equality, values: ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"], control: "select" },
  { field: "task.assigneeId", label: "مسئول کار", type: "userId", operators: equality, control: "text" },
  { field: "task.teamId", label: "تیم کار", type: "teamId", operators: equality, control: "text" },
  { field: "actor.id", label: "انجام‌دهنده رویداد", type: "userId", operators: equality, control: "text" },
]
const meetingFields: NotificationConditionFieldDefinition[] = [
  { field: "meeting.type", label: "نوع جلسه", type: "string", operators: equality, control: "text" },
  { field: "meeting.status", label: "وضعیت جلسه", type: "enum", operators: equality, values: ["SCHEDULED", "COMPLETED", "CANCELLED"], control: "select" },
  { field: "meeting.organizerId", label: "برگزارکننده جلسه", type: "userId", operators: equality, control: "text" },
  { field: "actor.id", label: "انجام‌دهنده رویداد", type: "userId", operators: equality, control: "text" },
]
const opportunityFields: NotificationConditionFieldDefinition[] = [
  { field: "opportunity.fromStage", label: "مرحله قبلی فرصت", type: "string", operators: equality, control: "text" },
  { field: "opportunity.toStage", label: "مرحله جدید فرصت", type: "string", operators: equality, control: "text" },
  { field: "opportunity.priority", label: "اولویت فرصت", type: "enum", operators: equality, values: ["LOW", "MEDIUM", "HIGH", "URGENT"], control: "select" },
  { field: "opportunity.probability", label: "احتمال موفقیت فرصت", type: "number", operators: numeric, control: "number" },
  { field: "opportunity.ownerId", label: "مالک فرصت", type: "userId", operators: equality, control: "text" },
  { field: "actor.id", label: "انجام‌دهنده رویداد", type: "userId", operators: equality, control: "text" },
]
const scheduleFields: NotificationConditionFieldDefinition[] = [
  { field: "schedule.offsetMinutes", label: "فاصله اعلان تا موعد (دقیقه)", type: "number", operators: numeric, control: "number" },
  { field: "schedule.scheduledAt", label: "زمان برنامه‌ریزی اعلان", type: "string", operators: equality, control: "text" },
]

export const NOTIFICATION_CONDITION_CATALOG: Record<string, NotificationConditionEventDefinition> = {
  "TASK.ASSIGNED": { eventName: "TASK.ASSIGNED", label: "ارجاع کار", conditionFields: taskFields },
  "TASK.REASSIGNED": { eventName: "TASK.REASSIGNED", label: "ارجاع مجدد کار", conditionFields: taskFields },
  "TASK.COMPLETED": { eventName: "TASK.COMPLETED", label: "تکمیل کار", conditionFields: taskFields },
  "TASK.DUE_SOON": { eventName: "TASK.DUE_SOON", label: "نزدیک‌شدن سررسید کار", conditionFields: [...taskFields, ...scheduleFields] },
  "TASK.OVERDUE": { eventName: "TASK.OVERDUE", label: "سررسید گذشته کار", conditionFields: [...taskFields, ...scheduleFields] },
  "MEETING.CREATED": { eventName: "MEETING.CREATED", label: "ایجاد جلسه", conditionFields: meetingFields },
  "MEETING.UPDATED": { eventName: "MEETING.UPDATED", label: "ویرایش جلسه", conditionFields: meetingFields },
  "MEETING.CANCELLED": { eventName: "MEETING.CANCELLED", label: "لغو جلسه", conditionFields: meetingFields },
  "MEETING.REMINDER": { eventName: "MEETING.REMINDER", label: "یادآوری جلسه", conditionFields: [...meetingFields, ...scheduleFields] },
  "OPPORTUNITY.STAGE_CHANGED": { eventName: "OPPORTUNITY.STAGE_CHANGED", label: "تغییر مرحله فرصت", conditionFields: opportunityFields },
}

export function conditionDefinition(eventName: string) { return NOTIFICATION_CONDITION_CATALOG[eventName] }
