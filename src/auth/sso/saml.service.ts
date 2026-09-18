import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  Prisma,
  SsoProvider,
  SsoProviderType,
  SsoRoutingKind,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogService } from "../../audit-log/audit-log.service";
import { SsoTicketService } from "./sso-ticket.service";
import { createHash } from "crypto";

type SamlProfile = Record<string, unknown> & {
  nameID?: string;
  nameId?: string;
  issuer?: string;
  sessionIndex?: string;
};

@Injectable()
export class SamlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ssoTicketService: SsoTicketService,
    private readonly audit: AuditLogService,
  ) {}

  async buildLoginUrl(
    providerId: string,
    kind: "DOMAIN" | "SUBDOMAIN",
    rawRoute: string,
  ): Promise<string> {
    const provider = await this.getActiveSamlProvider(
      providerId,
      kind,
      rawRoute,
    );
    const saml = this.createSamlClient(provider);
    const state = randomBytes(48).toString("base64url");
    await this.prisma.ssoAuthTransaction.create({
      data: {
        stateHash: this.hash(state),
        organizationId: provider.organizationId!,
        providerId,
        redirectTarget: this.frontendCallback(),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return saml.getAuthorizeUrlAsync(state, undefined, {});
  }

  async handleAcs(
    providerId: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    try {
      return await this.handleAcsInternal(providerId, body);
    } catch (error) {
      await this.audit.record({
        organizationId: null,
        entityType: "SsoProvider",
        entityId: providerId,
        action: "sso.saml.login.failed",
        metadata: {
          category:
            error instanceof BadRequestException
              ? "INVALID_ASSERTION_OR_STATE"
              : "AUTHENTICATION_FAILED",
        },
      });
      throw error;
    }
  }

  private async handleAcsInternal(
    providerId: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const state = typeof body?.RelayState === "string" ? body.RelayState : "";
    const transaction = await this.consumeState(state);
    if (transaction.providerId !== providerId)
      throw new BadRequestException("Invalid SAML provider state");
    const provider = await this.getActiveSamlProviderByOwnership(
      providerId,
      transaction.organizationId,
    );

    if (!body?.SAMLResponse) {
      throw new BadRequestException("Missing SAMLResponse");
    }

    const saml = this.createSamlClient(provider);

    const result = await saml.validatePostResponseAsync(
      body as Record<string, string>,
    );

    const profile = result.profile as SamlProfile | undefined;

    if (!profile) {
      throw new BadRequestException("Invalid SAML response profile");
    }

    const subject = this.extractSubject(profile);
    const email = this.extractEmail(provider, profile);
    const fullName = this.extractFullName(provider, profile, email);
    const groups = this.extractGroups(provider, profile);

    const user = await this.resolveUser(provider, {
      subject,
      email,
      fullName,
      groups,
    });

    const ticket = await this.ssoTicketService.createTicket(
      user.id,
      provider.id,
    );
    await this.audit.record({
      actorId: user.id,
      organizationId: provider.organizationId,
      entityType: "SsoProvider",
      entityId: provider.id,
      action: "sso.saml.login.success",
    });

    const frontendCallbackUrl = this.frontendCallback();

    if (!frontendCallbackUrl) {
      throw new InternalServerErrorException(
        "Frontend SSO callback URL is not configured",
      );
    }

    const url = new URL(frontendCallbackUrl);
    url.searchParams.set("ticket", ticket);
    url.searchParams.set("providerId", provider.id);
    url.searchParams.set("type", "SAML");

    return url.toString();
  }

  async generateMetadata(
    providerId: string,
    kind: "DOMAIN" | "SUBDOMAIN",
    rawRoute: string,
  ): Promise<string> {
    const provider = await this.getActiveSamlProvider(
      providerId,
      kind,
      rawRoute,
    );
    const saml = this.createSamlClient(provider);

    return saml.generateServiceProviderMetadata(null, null);
  }

  private async getActiveSamlProvider(
    providerId: string,
    kind: "DOMAIN" | "SUBDOMAIN",
    rawRoute: string,
  ): Promise<SsoProvider> {
    const route = rawRoute
      .trim()
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "");
    if (!route) throw new NotFoundException("Active SAML provider not found");
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        organizationId: { not: null },
        organization: { status: OrganizationStatus.ACTIVE },
        routes: { some: { kind: SsoRoutingKind[kind], value: route } },
      },
    });

    if (
      !provider ||
      !provider.isActive ||
      provider.type !== SsoProviderType.SAML
    ) {
      throw new NotFoundException("Active SAML provider not found");
    }

    return provider;
  }

  private async getActiveSamlProviderByOwnership(
    providerId: string,
    organizationId: string,
  ) {
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        organizationId,
        isActive: true,
        type: SsoProviderType.SAML,
        organization: { status: OrganizationStatus.ACTIVE },
      },
    });
    if (!provider)
      throw new NotFoundException("Active SAML provider not found");
    return provider;
  }

  private createSamlClient(provider: SsoProvider): SAML {
    const callbackUrl = this.getAcsUrl(provider.id);
    const issuer = provider.entityId || this.getEntityId(provider.id);

    if (!provider.ssoUrl) {
      throw new BadRequestException("SAML provider SSO URL is not configured");
    }

    if (!provider.x509Certificate) {
      throw new BadRequestException(
        "SAML provider X.509 certificate is not configured",
      );
    }

    return new SAML({
      callbackUrl,
      entryPoint: provider.ssoUrl,
      issuer,
      audience: issuer,
      idpCert: this.normalizeCertificate(provider.x509Certificate),
      identifierFormat:
        "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      signatureAlgorithm: "sha256",
      digestAlgorithm: "sha256",
      wantAssertionsSigned: provider.wantAssertionsSigned,
      wantAuthnResponseSigned: provider.wantResponseSigned,
      validateInResponseTo: ValidateInResponseTo.always,
      acceptedClockSkewMs: 120000,
      disableRequestedAuthnContext: true,
    });
  }

  private getBackendPublicUrl(): string {
    const value = this.config.get<string>("BACKEND_PUBLIC_URL");

    if (!value) {
      throw new InternalServerErrorException(
        "BACKEND_PUBLIC_URL is not configured",
      );
    }

    return value.replace(/\/$/, "");
  }

  private getAcsUrl(providerId: string): string {
    return `${this.getBackendPublicUrl()}/api/auth/saml/${providerId}/acs`;
  }

  private getEntityId(providerId: string): string {
    return `${this.getBackendPublicUrl()}/api/auth/saml/${providerId}/metadata`;
  }

  private normalizeCertificate(value: string): string {
    const trimmed = value.trim();

    if (trimmed.includes("BEGIN CERTIFICATE")) {
      return trimmed;
    }

    const body = trimmed.replace(/\s+/g, "");
    const rows = body.match(/.{1,64}/g)?.join("\n") ?? body;

    return `-----BEGIN CERTIFICATE-----\n${rows}\n-----END CERTIFICATE-----`;
  }

  private extractSubject(profile: SamlProfile): string {
    const subject = profile.nameID || profile.nameId;

    if (!subject || typeof subject !== "string") {
      throw new BadRequestException("SAML subject NameID is missing");
    }

    return subject;
  }

  private extractEmail(provider: SsoProvider, profile: SamlProfile): string {
    const configured = this.getStringAttribute(
      profile,
      provider.emailAttribute,
    );

    const fallback =
      configured ||
      this.getStringAttribute(profile, "email") ||
      this.getStringAttribute(profile, "mail") ||
      this.getStringAttribute(
        profile,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      ) ||
      this.getStringAttribute(profile, "urn:oid:0.9.2342.19200300.100.1.3") ||
      profile.nameID ||
      profile.nameId;

    if (!fallback || typeof fallback !== "string") {
      throw new BadRequestException("SAML email attribute is missing");
    }

    return fallback.toLowerCase();
  }

  private extractFullName(
    provider: SsoProvider,
    profile: SamlProfile,
    email: string,
  ): string {
    return (
      this.getStringAttribute(profile, provider.nameAttribute) ||
      this.getStringAttribute(profile, "displayName") ||
      this.getStringAttribute(profile, "name") ||
      this.getStringAttribute(
        profile,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
      ) ||
      email
    );
  }

  private getStringAttribute(
    profile: SamlProfile,
    key?: string | null,
  ): string | undefined {
    if (!key) {
      return undefined;
    }

    const value = profile[key];

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }

    return undefined;
  }

  private async resolveUser(
    provider: SsoProvider,
    input: {
      subject: string;
      email: string;
      fullName: string;
      groups: string[];
    },
  ) {
    const mappedRoleId = await this.mappedRole(
      this.prisma,
      provider.id,
      input.groups,
    );
    const existingIdentity = await this.prisma.externalIdentity.findUnique({
      where: {
        providerId_subject: {
          providerId: provider.id,
          subject: input.subject,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingIdentity) {
      if (!existingIdentity.user.isActive) {
        throw new BadRequestException("User is inactive");
      }

      await this.assertOrCreateMembership(
        provider,
        existingIdentity.user.id,
        false,
        mappedRoleId,
      );
      return existingIdentity.user;
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: input.email,
      },
    });

    if (existingUser) {
      if (!existingUser.isActive) {
        throw new BadRequestException("User is inactive");
      }

      await this.assertOrCreateMembership(
        provider,
        existingUser.id,
        provider.autoProvision,
        mappedRoleId,
      );
      await this.prisma.externalIdentity.create({
        data: {
          providerId: provider.id,
          userId: existingUser.id,
          subject: input.subject,
          email: input.email,
        },
      });
      return existingUser;
    }

    if (!provider.autoProvision) {
      throw new BadRequestException("User is not provisioned");
    }

    this.assertAllowedDomain(provider, input.email);

    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          role: UserRole.REP,
          organizationId: provider.organizationId!,
          isActive: true,
        },
      });

      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: provider.organizationId!,
          roleId: mappedRoleId,
          status: OrganizationMembershipStatus.ACTIVE,
          isDefault: false,
          joinedAt: new Date(),
        },
      });

      await tx.externalIdentity.create({
        data: {
          providerId: provider.id,
          userId: user.id,
          subject: input.subject,
          email: input.email,
        },
      });

      return user;
    });
  }

  private extractGroups(provider: SsoProvider, profile: SamlProfile) {
    if (!provider.groupsAttribute) return [];
    const value = profile[provider.groupsAttribute];
    const values = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? [value]
        : [];
    return [
      ...new Set(
        values
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  private async mappedRole(
    tx: Pick<Prisma.TransactionClient, "ssoGroupRoleMapping">,
    providerId: string,
    groups: string[],
  ) {
    if (!groups.length) return null;
    const mappings = await tx.ssoGroupRoleMapping.findMany({
      where: { providerId, normalizedGroup: { in: groups } },
      select: { roleId: true },
    });
    const roles = [...new Set(mappings.map((item) => item.roleId))];
    if (roles.length > 1)
      throw new BadRequestException("Conflicting SSO group mappings");
    return roles[0] ?? null;
  }

  private async assertOrCreateMembership(
    provider: SsoProvider,
    userId: string,
    allowCreate: boolean,
    roleId: string | null,
  ) {
    if (!provider.organizationId)
      throw new BadRequestException("Provider tenant ownership is incomplete");
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: provider.organizationId,
        },
      },
    });
    if (membership?.status !== OrganizationMembershipStatus.ACTIVE) {
      if (membership || !allowCreate)
        throw new BadRequestException("SSO membership is inactive or missing");
      await this.prisma.organizationMembership.create({
        data: {
          userId,
          organizationId: provider.organizationId,
          roleId,
          status: OrganizationMembershipStatus.ACTIVE,
          isDefault: false,
          joinedAt: new Date(),
        },
      });
    }
  }

  private async consumeState(state: string) {
    if (!state) throw new BadRequestException("Missing SAML RelayState");
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.ssoAuthTransaction.findUnique({
        where: { stateHash: this.hash(state) },
      });
      if (!found || found.consumedAt || found.expiresAt <= new Date())
        throw new BadRequestException("Invalid or expired SAML state");
      const updated = await tx.ssoAuthTransaction.updateMany({
        where: { id: found.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new BadRequestException("SAML state already consumed");
      return found;
    });
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  private frontendCallback() {
    const value = this.config.get<string>("FRONTEND_SSO_CALLBACK_URL");
    if (!value)
      throw new InternalServerErrorException(
        "Frontend SSO callback URL is not configured",
      );
    return value;
  }

  private assertAllowedDomain(provider: SsoProvider, email: string): void {
    if (!provider.allowedDomains.length) {
      return;
    }

    const domain = email.split("@")[1]?.toLowerCase();

    if (!domain || !provider.allowedDomains.includes(domain)) {
      throw new BadRequestException("Email domain is not allowed");
    }
  }
}
