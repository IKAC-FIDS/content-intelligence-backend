import { BadRequestException, Injectable } from "@nestjs/common"
import { createHash } from "crypto"
import { AuditLogService } from "../../audit-log/audit-log.service"
import { SsoSecretService } from "../../auth/sso/sso-secret.service"
import type { TenantContext } from "../../common/tenant/tenant-context.types"
import { PrismaService, type TenantTransactionClient } from "../../prisma/prisma.service"
import type { RegisterPushSubscriptionDto, TestPushDto, UpdatePushSettingsDto } from "./dto/push.dto"
import { PushProviderRegistry } from "./push-provider.registry"
import type { PushProviderConfig, WebPushSubscriptionData } from "./push.types"

@Injectable()
export class PushSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly secrets: SsoSecretService, private readonly providers: PushProviderRegistry, private readonly audit: AuditLogService) {}

  async get(context: TenantContext) {
    const row = await this.prisma.withTenantTransaction(context, tx => tx.notificationPushSettings.findUnique({ where: { organizationId: context.organizationId } }))
    return this.publicSettings(row)
  }

  async update(context: TenantContext, dto: UpdatePushSettingsDto) {
    const current = await this.prisma.withTenantTransaction(context, tx => tx.notificationPushSettings.findUnique({ where: { organizationId: context.organizationId }, select: { privateKeyEnc: true } }))
    const privateKeyEnc = dto.clearPrivateKey ? null : dto.privateKey?.trim() ? this.secrets.encryptSecret(dto.privateKey.trim()) : current?.privateKeyEnc ?? null
    const provider = this.providers.get(dto.provider)
    void provider
    const publicKey = dto.publicKey?.trim() || null
    const subject = dto.subject?.trim() || null
    if (dto.enabled && (!publicKey || !privateKeyEnc || !subject)) throw new BadRequestException("کلید عمومی، کلید خصوصی و Subject برای فعال‌سازی پوش الزامی‌اند")
    const row = await this.prisma.withTenantTransaction(context, tx => tx.notificationPushSettings.upsert({
      where: { organizationId: context.organizationId },
      create: { organizationId: context.organizationId, provider: dto.provider, publicKey, privateKeyEnc, subject, enabled: dto.enabled, timeoutMs: dto.timeoutMs ?? 10000 },
      update: { provider: dto.provider, publicKey, privateKeyEnc, subject, enabled: dto.enabled, timeoutMs: dto.timeoutMs ?? 10000 },
    }))
    await this.audit.record({ organizationId: context.organizationId, actorId: context.userId, entityType: "notification-push-settings", entityId: row.id, action: "notification.push_settings_updated", metadata: { provider: row.provider, enabled: row.enabled, publicKeyChanged: dto.publicKey !== undefined, privateKeyChanged: Boolean(dto.privateKey || dto.clearPrivateKey) } })
    return this.publicSettings(row)
  }

  async configured(context: TenantContext) {
    const row = await this.prisma.withTenantTransaction(context, tx => tx.notificationPushSettings.findUnique({ where: { organizationId: context.organizationId } }))
    if (!row?.enabled || !row.publicKey || !row.privateKeyEnc || !row.subject) throw new BadRequestException("کانال پوش فعال یا کامل نیست")
    const config: PushProviderConfig = { publicKey: row.publicKey, privateKey: this.secrets.decryptSecret(row.privateKeyEnc), subject: row.subject, timeoutMs: row.timeoutMs }
    return { row, provider: this.providers.get(row.provider), config }
  }

  async status(context: TenantContext) {
    const settings = await this.get(context)
    return { channel: "PUSH", available: true, configured: settings.configured, enabled: settings.enabled, usable: settings.usable, provider: settings.provider || null, configurationPath: "/admin/notifications?tab=channels" }
  }

  async publicConfig(context: TenantContext) {
    const settings = await this.get(context)
    return { provider: settings.provider, enabled: settings.enabled, configured: settings.configured, publicKey: settings.usable ? settings.publicKey : null }
  }

  async register(context: TenantContext, dto: RegisterPushSubscriptionDto, userAgent?: string) {
    const settings = await this.get(context)
    if (!settings.usable || settings.provider !== "WEB_PUSH") throw new BadRequestException("کانال Web Push سازمان فعال نیست")
    const subscription: WebPushSubscriptionData = { endpoint: dto.endpoint, expirationTime: dto.expirationTime ?? null, keys: dto.keys }
    const externalEndpointId = this.endpointHash(dto.endpoint)
    return this.prisma.withTenantTransaction(context, tx => tx.notificationPushEndpoint.upsert({
      where: { organizationId_provider_externalEndpointId: { organizationId: context.organizationId, provider: "WEB_PUSH", externalEndpointId } },
      create: { organizationId: context.organizationId, userId: context.userId, provider: "WEB_PUSH", endpointType: "WEB", externalEndpointId, endpointEnc: this.secrets.encryptSecret(JSON.stringify(subscription)), metadata: { label: dto.label?.trim() || null, userAgent: userAgent?.slice(0, 500) || null }, active: true },
      update: { userId: context.userId, endpointEnc: this.secrets.encryptSecret(JSON.stringify(subscription)), metadata: { label: dto.label?.trim() || null, userAgent: userAgent?.slice(0, 500) || null }, active: true, lastSeenAt: new Date() },
      select: { id: true, provider: true, endpointType: true, active: true, lastSeenAt: true, createdAt: true },
    }))
  }

  listOwn(context: TenantContext) { return this.prisma.withTenantTransaction(context, tx => tx.notificationPushEndpoint.findMany({ where: { organizationId: context.organizationId, userId: context.userId, active: true }, select: { id: true, provider: true, endpointType: true, metadata: true, active: true, lastSeenAt: true, createdAt: true }, orderBy: { lastSeenAt: "desc" } })) }
  async removeOwn(context: TenantContext, id: string) {
    const result = await this.prisma.withTenantTransaction(context, tx => tx.notificationPushEndpoint.updateMany({ where: { id, organizationId: context.organizationId, userId: context.userId }, data: { active: false } }))
    if (!result.count) throw new BadRequestException("اشتراک پوش متعلق به کاربر جاری یافت نشد")
    return { disabled: true }
  }

  endpoints(context: TenantContext, userId: string, tx: TenantTransactionClient) { return tx.notificationPushEndpoint.findMany({ where: { organizationId: context.organizationId, userId, active: true }, orderBy: { lastSeenAt: "desc" } }) }
  decodeEndpoint(value: string): WebPushSubscriptionData { return JSON.parse(this.secrets.decryptSecret(value)) as WebPushSubscriptionData }
  deactivate(context: TenantContext, ids: string[], tx: TenantTransactionClient) { return tx.notificationPushEndpoint.updateMany({ where: { id: { in: ids }, organizationId: context.organizationId }, data: { active: false } }) }

  async test(context: TenantContext, dto: TestPushDto) {
    const { provider, config } = await this.configured(context)
    const endpoints = await this.prisma.withTenantTransaction(context, tx => this.endpoints(context, dto.recipientUserId, tx))
    const results = await Promise.all(endpoints.map(endpoint => provider.send({ recipientUserId: dto.recipientUserId, endpointId: endpoint.id, subscription: this.decodeEndpoint(endpoint.endpointEnc), title: dto.title?.trim() || "اعلان آزمایشی CRM", body: dto.body?.trim() || "تنظیمات اعلان پوش با موفقیت بررسی شد.", actionUrl: "/notifications", idempotencyKey: `push-test:${context.organizationId}:${endpoint.id}:${Date.now()}` }, config)))
    const invalid = endpoints.filter((_, index) => results[index]?.invalidEndpoint).map(item => item.id)
    if (invalid.length) await this.prisma.withTenantTransaction(context, tx => this.deactivate(context, invalid, tx))
    return { attempted: endpoints.length, successful: results.filter(item => item.success).length, failed: results.filter(item => !item.success).length, results: results.map((item, index) => ({ endpointId: endpoints[index]?.id, success: item.success, providerStatus: item.providerStatus, errorCode: item.errorCode, errorMessage: item.errorMessage })) }
  }

  private endpointHash(value: string) { return createHash("sha256").update(value).digest("hex") }
  private publicSettings(row: { provider: string; publicKey: string | null; privateKeyEnc: string | null; subject: string | null; enabled: boolean; timeoutMs: number; updatedAt: Date } | null) {
    const providers = this.providers.list()
    if (!row) return { provider: providers[0] ?? "WEB_PUSH", publicKey: "", subject: "mailto:admin@example.com", enabled: false, timeoutMs: 10000, privateKeyConfigured: false, configured: false, usable: false, lastUpdatedAt: null, providers }
    const configured = Boolean(row.provider && row.publicKey && row.privateKeyEnc && row.subject)
    return { provider: row.provider, publicKey: row.publicKey || "", subject: row.subject || "", enabled: row.enabled, timeoutMs: row.timeoutMs, privateKeyConfigured: Boolean(row.privateKeyEnc), configured, usable: configured && row.enabled, lastUpdatedAt: row.updatedAt, providers }
  }
}
