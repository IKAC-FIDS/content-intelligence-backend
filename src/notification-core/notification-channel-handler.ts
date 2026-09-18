import type { NotificationChannel } from "@prisma/client"

export type NotificationDispatchResult = {
  deliveryId: string
  status: string
  sent: boolean
  reason?: string
}

export interface NotificationChannelHandler {
  readonly channel: NotificationChannel
  dispatch(deliveryId: string, organizationId?: string): Promise<NotificationDispatchResult>
}
