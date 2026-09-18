export const NOTIFICATION_EVENT_CATALOG = {
  MEETING: {
    CREATED: "MEETING.CREATED",
    UPDATED: "MEETING.UPDATED",
    CANCELLED: "MEETING.CANCELLED",
    REMINDER: "MEETING.REMINDER",
  },
  TASK: {
    ASSIGNED: "TASK.ASSIGNED",
    REASSIGNED: "TASK.REASSIGNED",
    COMPLETED: "TASK.COMPLETED",
    DUE_SOON: "TASK.DUE_SOON",
    OVERDUE: "TASK.OVERDUE",
  },
  OPPORTUNITY: {
    STAGE_CHANGED: "OPPORTUNITY.STAGE_CHANGED",
  },
  CONVERSATION: {
    MESSAGE_CREATED: "CONVERSATION.MESSAGE_CREATED",
    QUESTION_CREATED: "CONVERSATION.QUESTION_CREATED",
    REPLY_CREATED: "CONVERSATION.REPLY_CREATED",
    RESOLVED: "CONVERSATION.RESOLVED",
  },
} as const

export type NotificationEventName =
  | (typeof NOTIFICATION_EVENT_CATALOG.MEETING)[keyof typeof NOTIFICATION_EVENT_CATALOG.MEETING]
  | (typeof NOTIFICATION_EVENT_CATALOG.TASK)[keyof typeof NOTIFICATION_EVENT_CATALOG.TASK]
  | (typeof NOTIFICATION_EVENT_CATALOG.OPPORTUNITY)[keyof typeof NOTIFICATION_EVENT_CATALOG.OPPORTUNITY]
  | (typeof NOTIFICATION_EVENT_CATALOG.CONVERSATION)[keyof typeof NOTIFICATION_EVENT_CATALOG.CONVERSATION]

export const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "PUSH", "IN_APP"] as const
export type NotificationChannelCode = (typeof NOTIFICATION_CHANNELS)[number]

export type NotificationTemplateVariable = {
  key: string
  token: string
  label: string
  type: "string" | "date"
}

const commonVariables: NotificationTemplateVariable[] = [
  { key: "user.id", token: "{{user.id}}", label: "شناسه گیرنده", type: "string" },
  { key: "user.fullName", token: "{{user.fullName}}", label: "نام گیرنده", type: "string" },
  { key: "user.email", token: "{{user.email}}", label: "ایمیل گیرنده", type: "string" },
  { key: "actor.id", token: "{{actor.id}}", label: "شناسه انجام‌دهنده", type: "string" },
  { key: "actor.fullName", token: "{{actor.fullName}}", label: "نام انجام‌دهنده", type: "string" },
  { key: "organization.id", token: "{{organization.id}}", label: "شناسه سازمان", type: "string" },
  { key: "organization.name", token: "{{organization.name}}", label: "نام سازمان", type: "string" },
]

const meetingVariables: NotificationTemplateVariable[] = [
  { key: "meeting.id", token: "{{meeting.id}}", label: "شناسه جلسه", type: "string" },
  { key: "meeting.title", token: "{{meeting.title}}", label: "عنوان جلسه", type: "string" },
  { key: "meeting.startAt", token: "{{meeting.startAt}}", label: "زمان شروع جلسه", type: "date" },
  { key: "meeting.endAt", token: "{{meeting.endAt}}", label: "زمان پایان جلسه", type: "date" },
  { key: "meeting.location", token: "{{meeting.location}}", label: "مکان جلسه", type: "string" },
  { key: "meeting.agenda", token: "{{meeting.agenda}}", label: "دستور جلسه", type: "string" },
  { key: "meeting.type", token: "{{meeting.type}}", label: "نوع جلسه", type: "string" },
  { key: "meeting.company.id", token: "{{meeting.company.id}}", label: "شناسه شرکت جلسه", type: "string" },
  { key: "meeting.company.name", token: "{{meeting.company.name}}", label: "نام شرکت جلسه", type: "string" },
]

const taskVariables: NotificationTemplateVariable[] = [
  { key: "task.priority", token: "{{task.priority}}", label: "اولویت کار", type: "string" },
  { key: "task.dueDate", token: "{{task.dueDate}}", label: "مهلت کار", type: "date" },
  { key: "task.opportunity.title", token: "{{task.opportunity.title}}", label: "عنوان فرصت", type: "string" },
  { key: "task.id", token: "{{task.id}}", label: "شناسه کار", type: "string" },
  { key: "task.title", token: "{{task.title}}", label: "عنوان کار", type: "string" },
  { key: "task.description", token: "{{task.description}}", label: "شرح کار", type: "string" },
  { key: "task.dueAt", token: "{{task.dueAt}}", label: "مهلت کار", type: "date" },
  { key: "task.assignee.fullName", token: "{{task.assignee.fullName}}", label: "نام مسئول کار", type: "string" },
  { key: "task.company.id", token: "{{task.company.id}}", label: "شناسه شرکت کار", type: "string" },
  { key: "task.company.name", token: "{{task.company.name}}", label: "نام شرکت کار", type: "string" },
]

const scheduleVariables: NotificationTemplateVariable[] = [
  { key: "schedule.offsetMinutes", token: "{{schedule.offsetMinutes}}", label: "فاصله زمانی اعلان (دقیقه)", type: "string" },
  { key: "schedule.scheduledAt", token: "{{schedule.scheduledAt}}", label: "زمان برنامه‌ریزی اعلان", type: "date" },
]

const opportunityVariables: NotificationTemplateVariable[] = [
  { key: "opportunity.id", token: "{{opportunity.id}}", label: "شناسه فرصت", type: "string" },
  { key: "opportunity.title", token: "{{opportunity.title}}", label: "عنوان فرصت", type: "string" },
  { key: "opportunity.priority", token: "{{opportunity.priority}}", label: "اولویت فرصت", type: "string" },
  { key: "opportunity.probability", token: "{{opportunity.probability}}", label: "احتمال موفقیت فرصت", type: "string" },
  { key: "opportunity.stage", token: "{{opportunity.stage}}", label: "مرحله فعلی فرصت", type: "string" },
  { key: "opportunity.fromStage", token: "{{opportunity.fromStage}}", label: "مرحله قبلی فرصت", type: "string" },
  { key: "opportunity.toStage", token: "{{opportunity.toStage}}", label: "مرحله جدید فرصت", type: "string" },
]

const conversationVariables: NotificationTemplateVariable[] = [
  { key: "conversation.threadId", token: "{{conversation.threadId}}", label: "شناسه گفتگو", type: "string" },
  { key: "conversation.messageId", token: "{{conversation.messageId}}", label: "شناسه پیام", type: "string" },
  { key: "conversation.entityType", token: "{{conversation.entityType}}", label: "نوع موجودیت", type: "string" },
  { key: "conversation.entityId", token: "{{conversation.entityId}}", label: "شناسه موجودیت", type: "string" },
  { key: "conversation.entityLabel", token: "{{conversation.entityLabel}}", label: "عنوان موجودیت", type: "string" },
  { key: "conversation.messageType", token: "{{conversation.messageType}}", label: "نوع پیام", type: "string" },
]

export const NOTIFICATION_TEMPLATE_VARIABLES: Record<NotificationEventName, NotificationTemplateVariable[]> = {
  "MEETING.CREATED": [...commonVariables, ...meetingVariables],
  "MEETING.UPDATED": [...commonVariables, ...meetingVariables],
  "MEETING.CANCELLED": [...commonVariables, ...meetingVariables],
  "MEETING.REMINDER": [...commonVariables, ...meetingVariables, ...scheduleVariables],
  "TASK.ASSIGNED": [...commonVariables, ...taskVariables],
  "TASK.REASSIGNED": [...commonVariables, ...taskVariables],
  "TASK.COMPLETED": [...commonVariables, ...taskVariables],
  "TASK.DUE_SOON": [...commonVariables, ...taskVariables, ...scheduleVariables],
  "TASK.OVERDUE": [...commonVariables, ...taskVariables, ...scheduleVariables],
  "OPPORTUNITY.STAGE_CHANGED": [...commonVariables, ...opportunityVariables],
  "CONVERSATION.MESSAGE_CREATED": [...commonVariables, ...conversationVariables],
  "CONVERSATION.QUESTION_CREATED": [...commonVariables, ...conversationVariables],
  "CONVERSATION.REPLY_CREATED": [...commonVariables, ...conversationVariables],
  "CONVERSATION.RESOLVED": [...commonVariables, ...conversationVariables],
}
