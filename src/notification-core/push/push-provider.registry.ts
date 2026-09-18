import { BadRequestException, Injectable } from "@nestjs/common"
import type { PushProvider } from "./push.types"
import { WebPushProvider } from "./web-push.provider"

@Injectable()
export class PushProviderRegistry {
  private readonly providers: Map<string, PushProvider>
  constructor(webPush: WebPushProvider) { this.providers = new Map([[webPush.code, webPush]]) }
  get(code: string) {
    const provider = this.providers.get(code)
    if (!provider) throw new BadRequestException("ارائه‌دهنده اعلان پوش پشتیبانی نمی‌شود")
    return provider
  }
  list() { return [...this.providers.keys()] }
}
