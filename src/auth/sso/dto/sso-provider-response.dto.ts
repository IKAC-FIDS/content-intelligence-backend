import { SsoProvider, SsoProviderType, UserRole } from "@prisma/client";

export interface SsoProviderResponseDto {
  id: string;
  organizationId: string;
  name: string;
  type: SsoProviderType;
  isActive: boolean;

  autoProvision: boolean;
  defaultRole: UserRole | null;
  allowedDomains: string[];

  issuer: string | null;
  clientId: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  jwksUrl: string | null;
  scopes: string[];

  entityId: string | null;
  ssoUrl: string | null;
  certificateConfigured: boolean;
  signRequests: boolean;
  wantAssertionsSigned: boolean;
  wantResponseSigned: boolean;

  emailAttribute: string | null;
  nameAttribute: string | null;
  groupsAttribute: string | null;

  secretConfigured: boolean;
  routingDomains: string[];
  routingSubdomains: string[];
  groupRoleMappings: Array<{ group: string; roleId: string }>;

  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSsoProviderResponseDto {
  id: string;
  name: string;
  type: SsoProviderType;
}

type ProviderResponseSource = SsoProvider & {
  routes?: Array<{ kind: "DOMAIN" | "SUBDOMAIN"; value: string }>;
  groupRoleMappings?: Array<{ normalizedGroup: string; roleId: string }>;
};

export function toSsoProviderResponse(
  provider: ProviderResponseSource,
): SsoProviderResponseDto {
  if (!provider.organizationId)
    throw new Error("Tenant-owned SSO provider is required");
  return {
    id: provider.id,
    organizationId: provider.organizationId,
    name: provider.name,
    type: provider.type,
    isActive: provider.isActive,

    autoProvision: provider.autoProvision,
    defaultRole: provider.defaultRole,
    allowedDomains: provider.allowedDomains,

    issuer: provider.issuer,
    clientId: provider.clientId,
    authorizationUrl: provider.authorizationUrl,
    tokenUrl: provider.tokenUrl,
    userInfoUrl: provider.userInfoUrl,
    jwksUrl: provider.jwksUrl,
    scopes: provider.scopes,

    entityId: provider.entityId,
    ssoUrl: provider.ssoUrl,
    certificateConfigured: Boolean(provider.x509Certificate),
    signRequests: provider.signRequests,
    wantAssertionsSigned: provider.wantAssertionsSigned,
    wantResponseSigned: provider.wantResponseSigned,

    emailAttribute: provider.emailAttribute,
    nameAttribute: provider.nameAttribute,
    groupsAttribute: provider.groupsAttribute,

    secretConfigured: Boolean(provider.clientSecretEnc),
    routingDomains:
      provider.routes
        ?.filter((route) => route.kind === "DOMAIN")
        .map((route) => route.value) ?? [],
    routingSubdomains:
      provider.routes
        ?.filter((route) => route.kind === "SUBDOMAIN")
        .map((route) => route.value) ?? [],
    groupRoleMappings:
      provider.groupRoleMappings?.map((mapping) => ({
        group: mapping.normalizedGroup,
        roleId: mapping.roleId,
      })) ?? [],

    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export function toPublicSsoProviderResponse(
  provider: Pick<SsoProvider, "id" | "name" | "type">,
): PublicSsoProviderResponseDto {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
  };
}
