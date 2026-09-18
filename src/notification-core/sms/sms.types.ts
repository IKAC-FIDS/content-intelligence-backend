export type SmsProviderConfig = {
  apiUrl: string
  apiKey: string
  senderNumber: string
  timeoutMs: number
}

export type SmsSendInput = {
  to: string
  message: string
  sender?: string | null
  idempotencyKey?: string
}

export type SmsSendResult = {
  success: boolean
  providerMessageId?: string | null
  providerStatus?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  rawMetadata?: Record<string, unknown>
}

export interface SmsProvider {
  readonly code: string
  validateConfig(config: SmsProviderConfig): void
  send(config: SmsProviderConfig, input: SmsSendInput): Promise<SmsSendResult>
}
