import { BadRequestException, Injectable } from "@nestjs/common"
import { GenericHttpSmsProvider } from "./generic-http-sms.provider"
import type { SmsProvider } from "./sms.types"

@Injectable()
export class SmsProviderRegistry {
  private readonly providers: Map<string, SmsProvider>
  constructor(generic: GenericHttpSmsProvider) { this.providers = new Map([[generic.code, generic]]) }
  get(code: string) {
    const provider = this.providers.get(code)
    if (!provider) throw new BadRequestException(`ارائه‌دهنده پیامک پشتیبانی نمی‌شود: ${code}`)
    return provider
  }
  list() { return [...this.providers.keys()] }
}
