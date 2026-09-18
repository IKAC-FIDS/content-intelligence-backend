import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OrganizationCalendarSystem,
  OrganizationDateFormat,
  OrganizationDomainStatus,
  OrganizationDomainType,
  OrganizationStatus,
  Prisma,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { TenantContext } from "../common/tenant/tenant-context.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrganizationDomainDto } from "./dto/create-organization-domain.dto";
import { UpdateOrganizationBrandingDto } from "./dto/update-organization-branding.dto";
import { UpdateOrganizationDomainDto } from "./dto/update-organization-domain.dto";
import { UpdateOrganizationSettingsDto } from "./dto/update-organization-settings.dto";
import { normalizeOrganizationHostname } from "./organization-domain-normalizer";
import { OrganizationDomainVerificationService } from "./organization-domain-verification.service";

const DEFAULTS = {
  timezone: "Asia/Tehran",
  locale: "fa-IR",
  calendarSystem: OrganizationCalendarSystem.PERSIAN,
  dateFormat: OrganizationDateFormat.YYYY_MM_DD,
  firstDayOfWeek: 6,
  emailSenderDisplayName: null,
  allowPasswordLogin: true,
  allowPasskeyLogin: true,
} as const;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

@Injectable()
export class OrganizationConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly dns: OrganizationDomainVerificationService,
  ) {}

  async getSettings(tenant: TenantContext) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: tenant.organizationId,
        status: { not: OrganizationStatus.ARCHIVED },
      },
      select: { timezone: true, locale: true, tenantSettings: true },
    });
    if (!organization)
      throw new NotFoundException("Organization settings not found");
    return (
      organization.tenantSettings ?? {
        ...DEFAULTS,
        timezone: organization.timezone || DEFAULTS.timezone,
        locale: organization.locale || DEFAULTS.locale,
      }
    );
  }

  async updateSettings(
    dto: UpdateOrganizationSettingsDto,
    tenant: TenantContext,
  ) {
    const before = await this.getSettings(tenant);
    const data = {
      ...dto,
      ...(dto.timezone && { timezone: dto.timezone.trim() }),
      ...(dto.locale && { locale: this.normalizeLocale(dto.locale) }),
      ...(dto.emailSenderDisplayName !== undefined && {
        emailSenderDisplayName: this.optionalText(dto.emailSenderDisplayName),
      }),
    };
    const after = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.organizationSettings.upsert({
        where: { organizationId: tenant.organizationId },
        create: { organizationId: tenant.organizationId, ...DEFAULTS, ...data },
        update: data,
      });
      if (dto.timezone !== undefined || dto.locale !== undefined)
        await tx.organization.update({
          where: { id: tenant.organizationId },
          data: {
            ...(dto.timezone !== undefined && { timezone: data.timezone }),
            ...(dto.locale !== undefined && { locale: data.locale }),
          },
        });
      return settings;
    });
    await this.audit.record({
      actorId: tenant.userId,
      organizationId: tenant.organizationId,
      entityType: "OrganizationSettings",
      entityId: after.id,
      action: "organization.settings.updated",
      before,
      after: this.safeSettings(after),
    });
    return after;
  }

  async getBranding(tenant: TenantContext) {
    const branding = await this.prisma.organizationBranding.findUnique({
      where: { organizationId: tenant.organizationId },
    });
    return this.brandingResponse(branding);
  }

  async updateBranding(
    dto: UpdateOrganizationBrandingDto,
    tenant: TenantContext,
  ) {
    await Promise.all([
      this.validateAsset(
        dto.logoAttachmentId,
        tenant.organizationId,
        5 * 1024 * 1024,
      ),
      this.validateAsset(
        dto.faviconAttachmentId,
        tenant.organizationId,
        1024 * 1024,
      ),
    ]);
    const before = await this.getBranding(tenant);
    const data = {
      ...dto,
      ...(dto.displayTitle !== undefined && {
        displayTitle: this.optionalText(dto.displayTitle),
      }),
      ...this.normalizedColors(dto),
    };
    const branding = await this.prisma.organizationBranding.upsert({
      where: { organizationId: tenant.organizationId },
      create: { organizationId: tenant.organizationId, ...data },
      update: data,
    });
    const after = this.brandingResponse(branding);
    await this.audit.record({
      actorId: tenant.userId,
      organizationId: tenant.organizationId,
      entityType: "OrganizationBranding",
      entityId: branding.id,
      action: "organization.branding.updated",
      before,
      after,
    });
    return after;
  }

  listDomains(tenant: TenantContext) {
    return this.prisma.organizationDomain.findMany({
      where: { organizationId: tenant.organizationId },
      select: this.domainSelect(),
      orderBy: { createdAt: "desc" },
    });
  }

  async getDomain(id: string, tenant: TenantContext) {
    const domain = await this.prisma.organizationDomain.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: this.domainSelect(),
    });
    if (!domain) throw new NotFoundException("Organization domain not found");
    return domain;
  }

  async createDomain(dto: CreateOrganizationDomainDto, tenant: TenantContext) {
    const hostname = normalizeOrganizationHostname(dto.hostname);
    const subdomainLabel =
      dto.type === OrganizationDomainType.SUBDOMAIN
        ? hostname.split(".")[0]
        : null;
    const token = randomBytes(32).toString("base64url");
    try {
      const domain = await this.prisma.organizationDomain.create({
        data: {
          organizationId: tenant.organizationId,
          type: dto.type,
          hostname,
          subdomainLabel,
          verificationTokenHash: this.hash(token),
        },
        select: this.domainSelect(),
      });
      await this.audit.record({
        actorId: tenant.userId,
        organizationId: tenant.organizationId,
        entityType: "OrganizationDomain",
        entityId: domain.id,
        action: "organization.domain.created",
        after: domain,
      });
      return {
        ...domain,
        verification: {
          method: "DNS_TXT",
          recordName: `_iam-crm-verification.${hostname}`,
          recordValue: `iam-crm-verification=${token}`,
        },
      };
    } catch (error) {
      this.translateConflict(error);
    }
  }

  async updateDomain(
    id: string,
    dto: UpdateOrganizationDomainDto,
    tenant: TenantContext,
  ) {
    const before = await this.getDomain(id, tenant);
    if (
      dto.status !== OrganizationDomainStatus.DISABLED &&
      dto.status !== OrganizationDomainStatus.PENDING
    )
      throw new BadRequestException(
        "Domain status can only be disabled or reset to pending",
      );
    const domain = await this.prisma.organizationDomain.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === OrganizationDomainStatus.PENDING && {
          verifiedAt: null,
          failureCode: null,
        }),
      },
      select: this.domainSelect(),
    });
    await this.audit.record({
      actorId: tenant.userId,
      organizationId: tenant.organizationId,
      entityType: "OrganizationDomain",
      entityId: id,
      action:
        dto.status === OrganizationDomainStatus.DISABLED
          ? "organization.domain.disabled"
          : "organization.domain.updated",
      before,
      after: domain,
    });
    return domain;
  }

  async verifyDomain(id: string, tenant: TenantContext) {
    const record = await this.prisma.organizationDomain.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!record) throw new NotFoundException("Organization domain not found");
    if (record.status === OrganizationDomainStatus.DISABLED)
      throw new ConflictException("Disabled domain cannot be verified");
    if (record.status === OrganizationDomainStatus.VERIFIED)
      return this.getDomain(id, tenant);
    const checkedAt = new Date();
    try {
      const values = await this.dns.readTxt(
        `_iam-crm-verification.${record.hostname}`,
      );
      const matched = values.some(
        (value) =>
          value.startsWith("iam-crm-verification=") &&
          this.hash(value.slice("iam-crm-verification=".length)) ===
            record.verificationTokenHash,
      );
      if (!matched)
        throw new BadRequestException("DNS verification record did not match");
      const domain = await this.prisma.organizationDomain.update({
        where: { id },
        data: {
          status: OrganizationDomainStatus.VERIFIED,
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt,
          failureCode: null,
        },
        select: this.domainSelect(),
      });
      await this.audit.record({
        actorId: tenant.userId,
        organizationId: tenant.organizationId,
        entityType: "OrganizationDomain",
        entityId: id,
        action: "organization.domain.verified",
        after: domain,
      });
      return domain;
    } catch (error) {
      await this.prisma.organizationDomain.update({
        where: { id },
        data: {
          status: OrganizationDomainStatus.FAILED,
          lastCheckedAt: checkedAt,
          failureCode: "DNS_TXT_VERIFICATION_FAILED",
        },
      });
      await this.audit.record({
        actorId: tenant.userId,
        organizationId: tenant.organizationId,
        entityType: "OrganizationDomain",
        entityId: id,
        action: "organization.domain.verification_failed",
        metadata: { failureCode: "DNS_TXT_VERIFICATION_FAILED" },
      });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Domain verification failed");
    }
  }

  async resolveVerifiedHostname(rawHostname: string) {
    const hostname = normalizeOrganizationHostname(rawHostname);
    const domain = await this.prisma.organizationDomain.findFirst({
      where: {
        hostname,
        status: OrganizationDomainStatus.VERIFIED,
        organization: { status: OrganizationStatus.ACTIVE },
      },
      select: { organizationId: true, hostname: true, type: true },
    });
    return domain ?? null;
  }

  private async validateAsset(
    id: string | null | undefined,
    organizationId: string,
    maxBytes: number,
  ) {
    if (id === undefined || id === null) return;
    const attachment = await this.prisma.fileAttachment.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { mimeType: true, sizeBytes: true },
    });
    if (!attachment) throw new NotFoundException("Branding asset not found");
    if (
      !attachment.mimeType ||
      !IMAGE_TYPES.has(attachment.mimeType) ||
      attachment.sizeBytes === null ||
      attachment.sizeBytes > maxBytes
    )
      throw new BadRequestException("Unsupported branding asset");
  }

  private brandingResponse(
    value: {
      id: string;
      displayTitle: string | null;
      primaryColor: string | null;
      secondaryColor: string | null;
      accentColor: string | null;
      logoAttachmentId: string | null;
      faviconAttachmentId: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null,
  ) {
    if (!value)
      return {
        displayTitle: null,
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        logoAttachmentId: null,
        faviconAttachmentId: null,
        logoUrl: null,
        faviconUrl: null,
      };
    return {
      id: value.id,
      displayTitle: value.displayTitle,
      primaryColor: value.primaryColor,
      secondaryColor: value.secondaryColor,
      accentColor: value.accentColor,
      logoAttachmentId: value.logoAttachmentId,
      faviconAttachmentId: value.faviconAttachmentId,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      logoUrl: value.logoAttachmentId
        ? `/api/attachments/${value.logoAttachmentId}/download`
        : null,
      faviconUrl: value.faviconAttachmentId
        ? `/api/attachments/${value.faviconAttachmentId}/download`
        : null,
    };
  }

  private normalizedColors(dto: UpdateOrganizationBrandingDto) {
    return Object.fromEntries(
      ["primaryColor", "secondaryColor", "accentColor"]
        .filter((key) => key in dto)
        .map((key) => [
          key,
          (
            dto[key as keyof UpdateOrganizationBrandingDto] as string | null
          )?.toUpperCase() ?? null,
        ]),
    );
  }
  private normalizeLocale(value: string) {
    try {
      return Intl.getCanonicalLocales(value.trim())[0];
    } catch {
      throw new BadRequestException("Invalid locale");
    }
  }
  private optionalText(value: string | null) {
    return value?.trim() || null;
  }
  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  private safeSettings(value: unknown) {
    return value;
  }
  private domainSelect() {
    return {
      id: true,
      type: true,
      hostname: true,
      subdomainLabel: true,
      status: true,
      verificationMethod: true,
      verifiedAt: true,
      lastCheckedAt: true,
      failureCode: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
  private translateConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictException("Organization domain is already assigned");
    throw error;
  }
}
