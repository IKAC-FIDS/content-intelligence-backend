import { Injectable } from "@nestjs/common"
import * as webpush from "web-push"
import type { PushProvider, PushProviderConfig, PushSendInput, PushSendResult } from "./push.types"

@Injectable()
export class WebPushProvider implements PushProvider {
  readonly code = "WEB_PUSH"

  async send(input: PushSendInput, config: PushProviderConfig): Promise<PushSendResult> {
    try {
      const response = await webpush.sendNotification(
        input.subscription,
        JSON.stringify({ title: input.title, body: input.body, actionUrl: input.actionUrl ?? null, icon: input.icon ?? null, badge: input.badge ?? null, data: input.data ?? {}, idempotencyKey: input.idempotencyKey }),
        { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 300, timeout: config.timeoutMs },
      )
      return { success: true, providerMessageId: response.headers?.location ?? null, providerStatus: String(response.statusCode), rawMetadata: { statusCode: response.statusCode } }
    } catch (error) {
      const candidate = error as { statusCode?: number; name?: string }
      const status = candidate.statusCode
      const invalidEndpoint = status === 404 || status === 410
      const timedOut = candidate.name === "AbortError" || candidate.name === "TimeoutError"
      return {
        success: false,
        invalidEndpoint,
        providerStatus: status ? String(status) : null,
        errorCode: invalidEndpoint ? "INVALID_PUSH_ENDPOINT" : timedOut ? "PROVIDER_TIMEOUT" : status === 401 || status === 403 ? "PROVIDER_AUTH_FAILED" : status ? `HTTP_${status}` : "PROVIDER_NETWORK_ERROR",
        errorMessage: invalidEndpoint ? "اشتراک پوش منقضی یا نامعتبر است" : timedOut ? "مهلت اتصال به ارائه‌دهنده پوش پایان یافت" : "ارسال اعلان پوش ناموفق بود",
      }
    }
  }
}
