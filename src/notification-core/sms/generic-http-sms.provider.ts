import { BadRequestException, Injectable } from "@nestjs/common"
import type { SmsProvider, SmsProviderConfig, SmsSendInput, SmsSendResult } from "./sms.types"

@Injectable()
export class GenericHttpSmsProvider implements SmsProvider {
  readonly code = "GENERIC_HTTP_JSON"

  validateConfig(config: SmsProviderConfig) {
    let url: URL
    try { url = new URL(config.apiUrl) } catch { throw new BadRequestException("آدرس API پیامک معتبر نیست") }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new BadRequestException("آدرس API پیامک باید HTTPS باشد")
    }
    if (url.username || url.password) throw new BadRequestException("قرار دادن اطلاعات ورود در آدرس API مجاز نیست")
    if (!config.apiKey.trim()) throw new BadRequestException("کلید API پیامک تنظیم نشده است")
    if (!config.senderNumber.trim()) throw new BadRequestException("شماره فرستنده پیامک تنظیم نشده است")
    if (config.timeoutMs < 1000 || config.timeoutMs > 60000) throw new BadRequestException("مهلت اتصال پیامک نامعتبر است")
  }

  async send(config: SmsProviderConfig, input: SmsSendInput): Promise<SmsSendResult> {
    this.validateConfig(config)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ to: input.to, message: input.message, sender: input.sender ?? config.senderNumber, idempotencyKey: input.idempotencyKey }),
        signal: controller.signal,
      })
      const payload = await this.safeJson(response)
      if (!response.ok) return { success: false, errorCode: `HTTP_${response.status}`, errorMessage: `SMS provider rejected the request (${response.status})` }
      if (payload.success !== true) {
        return { success: false, errorCode: this.text(payload.errorCode) ?? "PROVIDER_REJECTED", errorMessage: this.text(payload.errorMessage) ?? "SMS provider rejected the request" }
      }
      const messageId = payload.messageId
      if (typeof messageId !== "string" && typeof messageId !== "number") {
        return { success: false, errorCode: "MALFORMED_PROVIDER_RESPONSE", errorMessage: "SMS provider response did not include messageId" }
      }
      return { success: true, providerMessageId: String(messageId), providerStatus: this.text(payload.status), rawMetadata: { status: this.text(payload.status) } }
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError"
      return { success: false, errorCode: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR", errorMessage: timedOut ? "SMS provider request timed out" : "SMS provider network request failed" }
    } finally { clearTimeout(timeout) }
  }

  private async safeJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const value: unknown = await response.json()
      return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
    } catch { return {} }
  }
  private text(value: unknown) { return typeof value === "string" ? value.slice(0, 500) : null }
}
