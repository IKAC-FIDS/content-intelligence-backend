import { BadRequestException, Injectable } from "@nestjs/common"
import { AuditLogService } from "../../audit-log/audit-log.service"
import { SsoSecretService } from "../../auth/sso/sso-secret.service"
import { PrismaService } from "../../prisma/prisma.service"
import type { TestSmsDto, UpdateSmsSettingsDto } from "./dto/sms-settings.dto"
import { SmsProviderRegistry } from "./sms-provider.registry"
import type { SmsProviderConfig } from "./sms.types"
import { SmsRecipientResolver } from "./sms-recipient-resolver.service"

@Injectable()
export class SmsSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SsoSecretService,
    private readonly providers: SmsProviderRegistry,
    private readonly audit: AuditLogService,
    private readonly contacts: SmsRecipientResolver,
  ) {}

  async get(organizationId: string) {
    const row = await this.prisma.notificationSmsSettings.findUnique({ where: { organizationId } })
    return this.publicSettings(row)
  }

  async update(organizationId: string, actorId: string, dto: UpdateSmsSettingsDto) {
    const current = await this.prisma.notificationSmsSettings.findUnique({ where: { organizationId }, select: { apiKeyEnc: true } })
    const apiKeyEnc = dto.clearApiKey ? null : dto.apiKey?.trim() ? this.secrets.encryptSecret(dto.apiKey.trim()) : current?.apiKeyEnc ?? null
    const config = { apiUrl: dto.apiUrl.trim(), apiKey: apiKeyEnc ? this.secrets.decryptSecret(apiKeyEnc) : "", senderNumber: dto.senderNumber.trim(), timeoutMs: dto.timeoutMs ?? 10000 }
    const provider = this.providers.get(dto.provider.trim())
    if (dto.enabled) provider.validateConfig(config)
    const row = await this.prisma.notificationSmsSettings.upsert({
      where: { organizationId },
      create: { organizationId, provider: provider.code, apiUrl: config.apiUrl, apiKeyEnc, senderNumber: config.senderNumber, enabled: dto.enabled, timeoutMs: config.timeoutMs },
      update: { provider: provider.code, apiUrl: config.apiUrl, apiKeyEnc, senderNumber: config.senderNumber, enabled: dto.enabled, timeoutMs: config.timeoutMs },
    })
    await this.audit.record({ actorId, organizationId, entityType: "notification-sms-settings", entityId: row.id, action: "notification.sms_settings_updated", metadata: { provider: row.provider, apiUrl: row.apiUrl, senderNumber: row.senderNumber, enabled: row.enabled, apiKeyChanged: Boolean(dto.apiKey || dto.clearApiKey) } })
    return this.publicSettings(row)
  }

  async configured(organizationId: string) {
    const row = await this.prisma.notificationSmsSettings.findUnique({ where: { organizationId } })
    if (!row?.enabled) throw new BadRequestException("سرویس پیامک فعال نیست")
    if (!row.apiKeyEnc) throw new BadRequestException("کلید API پیامک تنظیم نشده است")
    const provider = this.providers.get(row.provider)
    const config: SmsProviderConfig = { apiUrl: row.apiUrl, apiKey: this.secrets.decryptSecret(row.apiKeyEnc), senderNumber: row.senderNumber, timeoutMs: row.timeoutMs }
    provider.validateConfig(config)
    return { row, provider, config }
  }

  async test(organizationId: string, actorId: string, dto: TestSmsDto) {
    const destination = this.contacts.normalize(dto.recipient)
    if (!destination) throw new BadRequestException("شماره گیرنده پیامک معتبر نیست")
    const { provider, config } = await this.configured(organizationId)
    const result = await provider.send(config, { to: destination, message: dto.message?.trim() || "پیامک آزمایشی سامانه CRM", sender: config.senderNumber, idempotencyKey: `sms-test:${organizationId}:${Date.now()}` })
    await this.audit.record({ actorId, organizationId, entityType: "notification-sms-settings", action: "notification.sms_test_attempted", metadata: { provider: provider.code, destination: this.contacts.mask(destination), success: result.success, providerMessageId: result.providerMessageId, errorCode: result.errorCode } })
    return result
  }

  async status(organizationId: string) {
    const row = await this.prisma.notificationSmsSettings.findUnique({ where: { organizationId } })
    if (!row) return { channel: "SMS", available: true, configured: false, enabled: false, usable: false, provider: null, configurationPath: "/admin/notifications?tab=channels" }
    const configured = Boolean(row.provider && row.apiUrl && row.apiKeyEnc && row.senderNumber)
    return { channel: "SMS", available: true, configured, enabled: row.enabled, usable: configured && row.enabled, provider: row.provider, configurationPath: "/admin/notifications?tab=channels" }
  }

  providersList() { return this.providers.list() }

  private publicSettings(row: { provider: string; apiUrl: string; apiKeyEnc: string | null; senderNumber: string; enabled: boolean; timeoutMs: number; updatedAt: Date } | null) {
    return row ? { provider: row.provider, apiUrl: row.apiUrl, senderNumber: row.senderNumber, enabled: row.enabled, timeoutMs: row.timeoutMs, apiKeyConfigured: Boolean(row.apiKeyEnc), configured: Boolean(row.provider && row.apiUrl && row.apiKeyEnc && row.senderNumber), usable: Boolean(row.enabled && row.provider && row.apiUrl && row.apiKeyEnc && row.senderNumber), lastUpdatedAt: row.updatedAt, providers: this.providers.list() } : { provider: this.providers.list()[0] ?? "", apiUrl: "", senderNumber: "", enabled: false, timeoutMs: 10000, apiKeyConfigured: false, configured: false, usable: false, lastUpdatedAt: null, providers: this.providers.list() }
  }
}
