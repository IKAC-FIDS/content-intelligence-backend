import { BadRequestException, NotFoundException } from "@nestjs/common";
import { OrganizationStatus, SsoProviderType } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SsoProviderService } from "../src/auth/sso/sso-provider.service";
import { SsoNetworkSecurityService } from "../src/auth/sso/sso-network-security.service";
import { toSsoProviderResponse } from "../src/auth/sso/dto/sso-provider-response.dto";

const tenant = (organizationId: string) => ({
  organizationId,
  tenantId: organizationId,
  userId: "user-a",
  membershipId: "membership-a",
  tenantRole: "ADMIN",
  permissions: ["sso-provider:manage"],
  platformAdmin: false,
  membershipStatus: "active" as const,
  resolutionSource: "token-session" as const,
});
const provider = (organizationId = "tenant-a") => ({
  id: "provider-a",
  organizationId,
  normalizedName: "provider",
  name: "Provider",
  type: SsoProviderType.OIDC,
  isActive: true,
  autoProvision: true,
  defaultRole: "REP" as const,
  allowedDomains: ["example.com"],
  issuer: "https://id.example.com",
  clientId: "client",
  clientSecretEnc: "gcm:secret",
  authorizationUrl: null,
  tokenUrl: null,
  userInfoUrl: null,
  jwksUrl: null,
  scopes: ["openid"],
  entityId: null,
  ssoUrl: null,
  x509Certificate: "CERTIFICATE",
  signRequests: false,
  wantAssertionsSigned: true,
  wantResponseSigned: false,
  emailAttribute: null,
  nameAttribute: null,
  groupsAttribute: "groups",
  createdAt: new Date(),
  updatedAt: new Date(),
  routes: [],
  groupRoleMappings: [],
});

describe("fix 000090 Tenant-scoped SSO Providers", () => {
  const serviceWith = (prisma: any) =>
    new SsoProviderService(
      prisma,
      { encryptSecret: jest.fn((v) => `encrypted:${v}`) } as any,
      { record: jest.fn() } as any,
      new SsoNetworkSecurityService(),
    );

  it("lists only the authenticated Tenant providers", async () => {
    const prisma = {
      ssoProvider: { findMany: jest.fn().mockResolvedValue([provider()]) },
    };
    await serviceWith(prisma).listProviders(tenant("tenant-a"));
    expect(prisma.ssoProvider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "tenant-a" } }),
    );
  });

  it("does not reveal a guessed cross-Tenant Provider UUID", async () => {
    const prisma = {
      ssoProvider: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      serviceWith(prisma).getProvider("provider-b", tenant("tenant-a")),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.ssoProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "provider-b", organizationId: "tenant-a" },
      }),
    );
  });

  it("discovers only an exact normalized route in an ACTIVE Organization", async () => {
    const prisma = {
      ssoProviderRoute: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            provider: {
              ...provider(),
              organization: { status: OrganizationStatus.ACTIVE },
            },
          }),
      },
    };
    const result = await serviceWith(prisma).discoverPublicProviders(
      "DOMAIN",
      " Example.COM. ",
    );
    expect(result).toHaveLength(1);
    expect(prisma.ssoProviderRoute.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind_value: { kind: "DOMAIN", value: "example.com" } },
      }),
    );
  });

  it("returns no discovery result for an inactive Organization", async () => {
    const prisma = {
      ssoProviderRoute: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            provider: {
              ...provider(),
              organization: { status: OrganizationStatus.SUSPENDED },
            },
          }),
      },
    };
    await expect(
      serviceWith(prisma).discoverPublicProviders("DOMAIN", "example.com"),
    ).resolves.toEqual([]);
  });

  it("never returns encrypted secrets or certificate material", () => {
    const response = toSsoProviderResponse(provider() as any) as any;
    expect(response.secretConfigured).toBe(true);
    expect(response.certificateConfigured).toBe(true);
    expect(response).not.toHaveProperty("clientSecretEnc");
    expect(response).not.toHaveProperty("x509Certificate");
    expect(JSON.stringify(response)).not.toContain("gcm:secret");
    expect(JSON.stringify(response)).not.toContain("CERTIFICATE");
  });

  it.each([
    "http://example.com",
    "https://localhost/path",
    "https://127.0.0.1",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1",
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://user:pass@example.com",
  ])("blocks unsafe SSO endpoint %s", (url) => {
    expect(() =>
      new SsoNetworkSecurityService().assertPublicHttpsUrl(url),
    ).toThrow(BadRequestException);
  });

  it("uses one-time persisted state bound to Provider and Organization with nonce and PKCE", () => {
    const source = readFileSync(
      join(process.cwd(), "src/auth/sso/oidc.service.ts"),
      "utf8",
    );
    expect(source).toContain("ssoAuthTransaction.create");
    expect(source).toContain("organizationId: provider.organizationId");
    expect(source).toContain("providerId: provider.id");
    expect(source).toContain("code_challenge_method: 'S256'");
    expect(source).toContain("nonceEnc: this.secrets.encryptSecret(nonce)");
    expect(source).toContain("consumedAt: null");
    expect(source).not.toContain("NodeCache");
  });

  it("provisions membership only into the Provider Organization and never as default or Owner", () => {
    for (const file of [
      "src/auth/sso/oidc.service.ts",
      "src/auth/sso/saml.service.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("organizationId");
      expect(source).toContain("isDefault: false");
      expect(source).not.toContain("isTenantOwner: true");
      expect(source).not.toContain("PLATFORM_ADMIN");
    }
  });

  it("uses explicit tenant group allowlists and rejects conflicting mapped roles", () => {
    const oidc = readFileSync(
      join(process.cwd(), "src/auth/sso/oidc.service.ts"),
      "utf8",
    );
    const saml = readFileSync(
      join(process.cwd(), "src/auth/sso/saml.service.ts"),
      "utf8",
    );
    expect(oidc).toContain("Conflicting SSO group mappings");
    expect(saml).toContain("Conflicting SSO group mappings");
    expect(oidc).toContain("role: UserRole.REP");
    expect(saml).toContain("role: UserRole.REP");
  });

  it("contains an additive migration with no Provider update, delete, or guessed default", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260812100000_tenant_scoped_sso_providers/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "organizationId" TEXT');
    expect(sql).toContain("sso_provider_routes_kind_value_key");
    expect(sql).not.toMatch(/UPDATE\s+"sso_providers"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toContain("DEFAULT '00000000");
  });

  it("removes encryption-key diagnostics from runtime logging", () => {
    const source = readFileSync(
      join(process.cwd(), "src/auth/sso/sso-secret.service.ts"),
      "utf8",
    );
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("secret?.length");
  });
});
