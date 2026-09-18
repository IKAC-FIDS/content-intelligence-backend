import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OrganizationStatus,
  Prisma,
  SsoProviderType,
  SsoRoutingKind,
} from "@prisma/client";
import { AuditLogService } from "../../audit-log/audit-log.service";
import type { TenantContext } from "../../common/tenant/tenant-context.types";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateSsoProviderDto } from "./dto/create-sso-provider.dto";
import {
  PublicSsoProviderResponseDto,
  SsoProviderResponseDto,
  toPublicSsoProviderResponse,
  toSsoProviderResponse,
} from "./dto/sso-provider-response.dto";
import { UpdateSsoProviderDto } from "./dto/update-sso-provider.dto";
import { SsoNetworkSecurityService } from "./sso-network-security.service";
import { SsoSecretService } from "./sso-secret.service";

const providerInclude = { routes: true, groupRoleMappings: true } as const;

@Injectable()
export class SsoProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SsoSecretService,
    private readonly audit: AuditLogService,
    private readonly network: SsoNetworkSecurityService,
  ) {}

  async discoverPublicProviders(
    kind: "DOMAIN" | "SUBDOMAIN",
    rawValue: string,
  ): Promise<PublicSsoProviderResponseDto[]> {
    const value = this.normalizeRoute(rawValue, kind);
    const route = await this.prisma.ssoProviderRoute.findUnique({
      where: { kind_value: { kind: SsoRoutingKind[kind], value } },
      include: {
        provider: { include: { organization: { select: { status: true } } } },
      },
    });
    if (
      !route ||
      !route.provider.isActive ||
      route.provider.organization?.status !== OrganizationStatus.ACTIVE
    )
      return [];
    return [toPublicSsoProviderResponse(route.provider)];
  }

  async listProviders(
    tenant: TenantContext,
  ): Promise<SsoProviderResponseDto[]> {
    const providers = await this.prisma.ssoProvider.findMany({
      where: { organizationId: tenant.organizationId },
      include: providerInclude,
      orderBy: { createdAt: "desc" },
    });
    return providers.map(toSsoProviderResponse);
  }

  async getProvider(
    id: string,
    tenant: TenantContext,
  ): Promise<SsoProviderResponseDto> {
    return toSsoProviderResponse(
      await this.tenantProvider(id, tenant.organizationId),
    );
  }

  async createProvider(
    dto: CreateSsoProviderDto,
    tenant: TenantContext,
    actorId?: string,
  ): Promise<SsoProviderResponseDto> {
    this.validateInput(dto.type, dto);
    await this.validateMappings(dto.groupRoleMappings, tenant.organizationId);
    try {
      const provider = await this.prisma.ssoProvider.create({
        data: {
          ...this.baseData(dto),
          organization: { connect: { id: tenant.organizationId } },
          normalizedName: this.normalizeName(dto.name),
          routes: { create: this.routes(dto, tenant.organizationId) },
          groupRoleMappings: { create: this.mappings(dto) },
        },
        include: providerInclude,
      });
      const response = toSsoProviderResponse(provider);
      await this.record(
        actorId,
        tenant.organizationId,
        provider.id,
        "sso.provider.created",
        undefined,
        response,
      );
      return response;
    } catch (error) {
      this.translateConflict(error);
    }
  }

  async updateProvider(
    id: string,
    dto: UpdateSsoProviderDto,
    tenant: TenantContext,
    actorId?: string,
  ): Promise<SsoProviderResponseDto> {
    const existing = await this.tenantProvider(id, tenant.organizationId);
    this.validateInput(dto.type ?? existing.type, dto);
    await this.validateMappings(dto.groupRoleMappings, tenant.organizationId);
    const existingDomains = existing.routes
      .filter((route) => route.kind === SsoRoutingKind.DOMAIN)
      .map((route) => route.value);
    const existingSubdomains = existing.routes
      .filter((route) => route.kind === SsoRoutingKind.SUBDOMAIN)
      .map((route) => route.value);
    try {
      const provider = await this.prisma.ssoProvider.update({
        where: { id },
        data: {
          ...this.updateData(dto),
          ...(dto.name !== undefined && {
            normalizedName: this.normalizeName(dto.name),
          }),
          ...((dto.routingDomains !== undefined ||
            dto.routingSubdomains !== undefined) && {
            routes: {
              deleteMany: {},
              create: this.routes(
                {
                  routingDomains: dto.routingDomains ?? existingDomains,
                  routingSubdomains:
                    dto.routingSubdomains ?? existingSubdomains,
                },
                tenant.organizationId,
              ),
            },
          }),
          ...(dto.groupRoleMappings !== undefined && {
            groupRoleMappings: { deleteMany: {}, create: this.mappings(dto) },
          }),
        },
        include: providerInclude,
      });
      const response = toSsoProviderResponse(provider);
      await this.record(
        actorId,
        tenant.organizationId,
        id,
        "sso.provider.updated",
        toSsoProviderResponse(existing),
        response,
        {
          secretReplaced: dto.clientSecret !== undefined,
          certificateReplaced: dto.x509Certificate !== undefined,
          mappingsChanged: dto.groupRoleMappings !== undefined,
        },
      );
      return response;
    } catch (error) {
      this.translateConflict(error);
    }
  }

  async disableProvider(id: string, tenant: TenantContext, actorId?: string) {
    const existing = await this.tenantProvider(id, tenant.organizationId);
    const provider = await this.prisma.ssoProvider.update({
      where: { id },
      data: { isActive: false },
      include: providerInclude,
    });
    const response = toSsoProviderResponse(provider);
    await this.record(
      actorId,
      tenant.organizationId,
      id,
      "sso.provider.disabled",
      toSsoProviderResponse(existing),
      response,
    );
    return response;
  }

  async deleteProvider(id: string, tenant: TenantContext, actorId?: string) {
    const existing = await this.prisma.ssoProvider.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: {
        ...providerInclude,
        _count: { select: { externalIdentities: true, loginTickets: true } },
      },
    });
    if (!existing) throw new NotFoundException("SSO provider not found");
    if (existing._count.externalIdentities || existing._count.loginTickets)
      return this.disableProvider(id, tenant, actorId);
    const response = toSsoProviderResponse(existing);
    await this.prisma.ssoProvider.delete({ where: { id } });
    await this.record(
      actorId,
      tenant.organizationId,
      id,
      "sso.provider.deleted",
      response,
    );
    return response;
  }

  async testConnection(id: string, tenant: TenantContext, actorId?: string) {
    const provider = await this.tenantProvider(id, tenant.organizationId);
    const target =
      provider.type === SsoProviderType.OIDC
        ? provider.issuer
        : provider.ssoUrl;
    if (!target)
      throw new BadRequestException("Provider endpoint is not configured");
    const result = await this.network.probe(target);
    await this.record(
      actorId,
      tenant.organizationId,
      id,
      "sso.provider.tested",
      undefined,
      undefined,
      result,
    );
    return result;
  }

  private tenantProvider(id: string, organizationId: string) {
    return this.prisma.ssoProvider
      .findFirst({ where: { id, organizationId }, include: providerInclude })
      .then((row) => {
        if (!row) throw new NotFoundException("SSO provider not found");
        return row;
      });
  }

  private baseData(
    dto: CreateSsoProviderDto,
  ): Prisma.SsoProviderCreateWithoutOrganizationInput {
    return {
      name: dto.name.trim(),
      type: dto.type,
      isActive: dto.isActive ?? true,
      autoProvision: dto.autoProvision ?? false,
      defaultRole: dto.defaultRole ?? "REP",
      allowedDomains: this.list(dto.allowedDomains).map((value) =>
        this.normalizeRoute(value, "DOMAIN"),
      ),
      issuer: this.url(dto.issuer),
      clientId: this.text(dto.clientId),
      clientSecretEnc: dto.clientSecret
        ? this.secrets.encryptSecret(dto.clientSecret)
        : null,
      authorizationUrl: this.url(dto.authorizationUrl),
      tokenUrl: this.url(dto.tokenUrl),
      userInfoUrl: this.url(dto.userInfoUrl),
      jwksUrl: this.url(dto.jwksUrl),
      scopes: this.list(dto.scopes, ["openid", "profile", "email"]),
      entityId: this.text(dto.entityId),
      ssoUrl: this.url(dto.ssoUrl),
      x509Certificate: this.text(dto.x509Certificate),
      signRequests: dto.signRequests ?? false,
      wantAssertionsSigned: dto.wantAssertionsSigned ?? true,
      wantResponseSigned: dto.wantResponseSigned ?? false,
      emailAttribute: this.text(dto.emailAttribute),
      nameAttribute: this.text(dto.nameAttribute),
      groupsAttribute: this.text(dto.groupsAttribute),
    };
  }

  private updateData(dto: UpdateSsoProviderDto): Prisma.SsoProviderUpdateInput {
    const data: Prisma.SsoProviderUpdateInput = {};
    for (const key of [
      "name",
      "type",
      "isActive",
      "autoProvision",
      "defaultRole",
      "signRequests",
      "wantAssertionsSigned",
      "wantResponseSigned",
    ] as const)
      if (dto[key] !== undefined)
        (data as any)[key] =
          typeof dto[key] === "string" && key === "name"
            ? dto[key]!.trim()
            : dto[key];
    if (dto.allowedDomains !== undefined)
      data.allowedDomains = this.list(dto.allowedDomains).map((value) =>
        this.normalizeRoute(value, "DOMAIN"),
      );
    for (const key of [
      "issuer",
      "authorizationUrl",
      "tokenUrl",
      "userInfoUrl",
      "jwksUrl",
      "ssoUrl",
    ] as const)
      if (dto[key] !== undefined) data[key] = this.url(dto[key]);
    for (const key of [
      "clientId",
      "entityId",
      "x509Certificate",
      "emailAttribute",
      "nameAttribute",
      "groupsAttribute",
    ] as const)
      if (dto[key] !== undefined) data[key] = this.text(dto[key]);
    if (dto.clientSecret !== undefined)
      data.clientSecretEnc = dto.clientSecret
        ? this.secrets.encryptSecret(dto.clientSecret)
        : null;
    if (dto.scopes !== undefined)
      data.scopes = this.list(dto.scopes, ["openid", "profile", "email"]);
    return data;
  }

  private routes(
    dto: Pick<CreateSsoProviderDto, "routingDomains" | "routingSubdomains">,
    organizationId: string,
  ) {
    return [
      ...this.list(dto.routingDomains).map((value) => ({
        organizationId,
        kind: SsoRoutingKind.DOMAIN,
        value: this.normalizeRoute(value, "DOMAIN"),
      })),
      ...this.list(dto.routingSubdomains).map((value) => ({
        organizationId,
        kind: SsoRoutingKind.SUBDOMAIN,
        value: this.normalizeRoute(value, "SUBDOMAIN"),
      })),
    ];
  }

  private mappings(dto: Pick<CreateSsoProviderDto, "groupRoleMappings">) {
    return (dto.groupRoleMappings ?? []).map((item) => ({
      normalizedGroup: item.group.trim().toLowerCase(),
      roleId: item.roleId,
    }));
  }

  private async validateMappings(
    mappings?: Array<{ group: string; roleId: string }>,
    organizationId?: string,
  ) {
    if (!mappings?.length) return;
    const normalized = mappings.map((item) => item.group.trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length)
      throw new BadRequestException("Duplicate SSO group mapping");
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: mappings.map((item) => item.roleId) },
        isActive: true,
        OR: [
          { scope: 'SYSTEM', organizationId: null },
          { scope: 'TENANT', organizationId },
        ],
      },
      select: { id: true },
    });
    if (roles.length !== new Set(mappings.map((item) => item.roleId)).size)
      throw new BadRequestException(
        "SSO group mapping role is invalid or inactive",
      );
  }

  private validateInput(
    type: SsoProviderType,
    dto: CreateSsoProviderDto | UpdateSsoProviderDto,
  ) {
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException("SSO provider name is required");
    if (
      type === SsoProviderType.OIDC &&
      dto.scopes &&
      !dto.scopes.includes("openid")
    )
      throw new BadRequestException("OIDC scopes must include openid");
    for (const value of [
      dto.issuer,
      dto.authorizationUrl,
      dto.tokenUrl,
      dto.userInfoUrl,
      dto.jwksUrl,
      dto.ssoUrl,
    ])
      if (value) this.network.assertPublicHttpsUrl(value);
  }

  private record(
    actorId: string | undefined,
    organizationId: string,
    entityId: string,
    action: string,
    before?: unknown,
    after?: unknown,
    metadata?: unknown,
  ) {
    return this.audit.record({
      actorId,
      organizationId,
      entityType: "SsoProvider",
      entityId,
      action,
      before,
      after,
      metadata,
    });
  }

  private normalizeName(value: string) {
    return value.trim().toLocaleLowerCase("en-US");
  }
  private normalizeRoute(value: string, kind: "DOMAIN" | "SUBDOMAIN") {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "");
    if (
      !normalized ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) ||
      (kind === "SUBDOMAIN" && normalized.includes("."))
    )
      throw new BadRequestException("Invalid SSO tenant route");
    return normalized;
  }
  private text(value?: string | null) {
    const text = value?.trim();
    return text || null;
  }
  private url(value?: string | null) {
    if (!value) return null;
    return this.network.assertPublicHttpsUrl(value).toString();
  }
  private list(value?: string[], fallback: string[] = []) {
    return [
      ...new Set(
        (value ?? fallback).map((item) => item.trim()).filter(Boolean),
      ),
    ];
  }
  private translateConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictException(
        "SSO provider identifier or tenant route already exists",
      );
    throw error;
  }
}
