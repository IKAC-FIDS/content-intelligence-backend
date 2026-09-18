export type WebPushSubscriptionData = {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}

export type PushProviderConfig = {
  publicKey: string
  privateKey: string
  subject: string
  timeoutMs: number
}

export type PushSendInput = {
  recipientUserId: string
  endpointId?: string
  subscription: WebPushSubscriptionData
  title: string
  body: string
  actionUrl?: string | null
  icon?: string | null
  badge?: string | null
  data?: Record<string, unknown>
  idempotencyKey?: string
}

export type PushSendResult = {
  success: boolean
  providerMessageId?: string | null
  providerStatus?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  invalidEndpoint?: boolean
  rawMetadata?: Record<string, unknown>
}

export type PushProviderTestResult = { success: boolean; errorCode?: string | null; errorMessage?: string | null }

export interface PushProvider {
  readonly code: string
  send(input: PushSendInput, config: PushProviderConfig): Promise<PushSendResult>
  testConnection?(config: PushProviderConfig): Promise<PushProviderTestResult>
}
