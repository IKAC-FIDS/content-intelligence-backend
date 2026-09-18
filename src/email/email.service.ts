import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { SsoSecretService } from '../auth/sso/sso-secret.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UpdateEmailSettingsDto } from './dto/email-settings.dto';

@Injectable()
export class EmailService {
  constructor(private readonly prisma: PrismaService, private readonly secrets: SsoSecretService, private readonly audit: AuditLogService) {}

  async getSettings(organizationId: string) {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { organizationId } });
    if (!settings) throw new NotFoundException('Organization settings not found');
    return this.publicSettings(settings);
  }

  async updateSettings(organizationId: string, actorId: string, dto: UpdateEmailSettingsDto) {
    if (dto.enabled && !dto.password && !(await this.hasPassword(organizationId))) throw new BadRequestException('رمز عبور SMTP الزامی است');
    const settings = await this.prisma.organizationSettings.upsert({
      where: { organizationId },
      create: { organizationId, smtpEnabled: dto.enabled, smtpHost: dto.host.trim(), smtpPort: dto.port, smtpSecure: dto.secure, smtpUsername: dto.username?.trim() || null, smtpPasswordEnc: dto.password ? this.secrets.encryptSecret(dto.password) : null, smtpFromEmail: dto.fromEmail.trim(), smtpFromName: dto.fromName?.trim() || null, smtpReplyTo: dto.replyTo?.trim() || null },
      update: { smtpEnabled: dto.enabled, smtpHost: dto.host.trim(), smtpPort: dto.port, smtpSecure: dto.secure, smtpUsername: dto.username?.trim() || null, ...(dto.password ? { smtpPasswordEnc: this.secrets.encryptSecret(dto.password) } : {}), smtpFromEmail: dto.fromEmail.trim(), smtpFromName: dto.fromName?.trim() || null, smtpReplyTo: dto.replyTo?.trim() || null },
    });
    await this.audit.record({ actorId, organizationId, entityType: 'organization-settings', entityId: settings.id, action: 'email.settings_updated', metadata: { host: settings.smtpHost, port: settings.smtpPort, enabled: settings.smtpEnabled } });
    return this.publicSettings(settings);
  }

  async send(organizationId: string, message: { to: string; subject: string; text?: string; html?: string }) {
    const settings = await this.assertConfigured(organizationId);
    const transport = createTransport({ host: settings.smtpHost, port: settings.smtpPort, secure: settings.smtpSecure, auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: settings.smtpPasswordEnc ? this.secrets.decryptSecret(settings.smtpPasswordEnc) : '' } : undefined });
    return transport.sendMail({ from: settings.smtpFromName ? `"${settings.smtpFromName.replace(/["\r\n]/g, '')}" <${settings.smtpFromEmail}>` : settings.smtpFromEmail, replyTo: settings.smtpReplyTo || undefined, ...message });
  }

  async assertConfigured(organizationId: string) {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { organizationId } });
    if (!settings?.smtpEnabled || !settings.smtpHost || !settings.smtpPort || !settings.smtpFromEmail) throw new BadRequestException('سرویس ایمیل فعال یا کامل نیست');
    return {
      ...settings,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpFromEmail: settings.smtpFromEmail,
    };
  }

  async sendTest(organizationId: string, actorId: string, to: string) {
    const result = await this.send(organizationId, { to, subject: 'آزمایش سرویس ایمیل CRM', text: 'تنظیمات سرویس ایمیل با موفقیت بررسی شد.' });
    await this.audit.record({ actorId, organizationId, entityType: 'organization-settings', action: 'email.test_sent', metadata: { to, messageId: result.messageId } });
    return { success: true, messageId: result.messageId };
  }

  private async hasPassword(organizationId: string) { const row = await this.prisma.organizationSettings.findUnique({ where: { organizationId }, select: { smtpPasswordEnc: true } }); return Boolean(row?.smtpPasswordEnc); }
  private publicSettings(settings: { smtpEnabled: boolean; smtpHost: string | null; smtpPort: number | null; smtpSecure: boolean; smtpUsername: string | null; smtpPasswordEnc: string | null; smtpFromEmail: string | null; smtpFromName: string | null; smtpReplyTo: string | null }) { return { enabled: settings.smtpEnabled, host: settings.smtpHost || '', port: settings.smtpPort ?? 465, secure: settings.smtpSecure, username: settings.smtpUsername || '', hasPassword: Boolean(settings.smtpPasswordEnc), fromEmail: settings.smtpFromEmail || '', fromName: settings.smtpFromName || '', replyTo: settings.smtpReplyTo || '' }; }
}
