import type { NotificationEventName } from "./notification-core.catalog"

export interface PublishNotificationEventInput {
  organizationId: string
  eventName: NotificationEventName
  aggregateType: "MEETING" | "TASK" | string
  aggregateId: string
  actorId?: string | null
  payload?: Record<string, unknown>
  idempotencyKey?: string | null
  occurredAt?: Date
}
