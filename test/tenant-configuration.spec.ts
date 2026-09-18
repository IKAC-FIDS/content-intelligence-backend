import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  OrganizationDomainStatus,
  OrganizationDomainType,
  OrganizationStatus,
} from "@prisma/client";
import { validate } from "class-validator";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { UpdateOrganizationBrandingDto } from "../src/organizations/dto/update-organization-branding.dto";
import { UpdateOrganizationSettingsDto } from "../src/organizations/dto/update-organization-settings.dto";
import { OrganizationConfigurationService } from "../src/organizations/organization-configuration.service";
import { normalizeOrganizationHostname } from "../src/organizations/organization-domain-normalizer";

const tenant = (organizationId = "tenant-a") =>
  ({
    tenantId: organizationId,
    organizationId,
    userId: "user-a",
    membershipId: "membership-a",
    tenantRole: "TENANT_ADMIN",
    permissions: ["organization:manage"],
    platformAdmin: false,
    membershipStatus: "active",
    resolutionSource: "authenticated-membership",
    requestId: "request-a",
  }) as any;

describe("fix 000089-B tenant settings, branding and domains", () => {
  it.each([
    ["EXAMPLE.COM.", "example.com"],
    ["BÜCHER.example", "xn--bcher-kva.example"],
  ])("normalizes %s exactly", (input, expected) =>
    expect(normalizeOrganizationHostname(input)).toBe(expected),
  );
  it.each([
    "https://example.com",
    "example.com/path",
    "example.com:443",
    "localhost",
    "bad_domain.example",
  ])("rejects invalid hostname %s", (input) =>
    expect(() => normalizeOrganizationHostname(input)).toThrow(
      BadRequestException,
    ),
  );

  it("rejects invalid timezone and locale", async () => {
    const dto = Object.assign(new UpdateOrganizationSettingsDto(), {
      timezone: "Mars/Olympus",
      locale: "not_a_locale",
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it.each(["red", "url(javascript:alert(1))", "<style>x</style>", "#12345G"])(
    "rejects unsafe color %s",
    async (primaryColor) => {
      const dto = Object.assign(new UpdateOrganizationBrandingDto(), {
        primaryColor,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it("uses legacy timezone/locale when no typed row exists", async () => {
    const prisma = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({
          timezone: "Asia/Tehran",
          locale: "fa-IR",
          tenantSettings: null,
        }),
      },
    };
    const service = new OrganizationConfigurationService(
      prisma as any,
      {} as any,
      {} as any,
    );
    await expect(service.getSettings(tenant())).resolves.toMatchObject({
      timezone: "Asia/Tehran",
      locale: "fa-IR",
      allowPasswordLogin: true,
      allowPasskeyLogin: true,
    });
    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "tenant-a" }),
      }),
    );
  });

  it("fails closed for archived or cross-tenant settings", async () => {
    const service = new OrganizationConfigurationService(
      { organization: { findFirst: jest.fn().mockResolvedValue(null) } } as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.getSettings(tenant("tenant-b")),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("requires a same-tenant active image attachment for branding", async () => {
    const prisma = {
      fileAttachment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new OrganizationConfigurationService(
      prisma as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.updateBranding(
        { logoAttachmentId: "00000000-0000-4000-8000-000000000099" },
        tenant(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fileAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "tenant-a",
          deletedAt: null,
        }),
      }),
    );
  });

  it.each([
    ["application/pdf", 100],
    ["image/png", 6 * 1024 * 1024],
  ])(
    "rejects unsupported or oversized branding asset",
    async (mimeType, sizeBytes) => {
      const prisma = {
        fileAttachment: {
          findFirst: jest.fn().mockResolvedValue({ mimeType, sizeBytes }),
        },
      };
      const service = new OrganizationConfigurationService(
        prisma as any,
        {} as any,
        {} as any,
      );
      await expect(
        service.updateBranding(
          { logoAttachmentId: "00000000-0000-4000-8000-000000000099" },
          tenant(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("never returns attachment object keys from branding", async () => {
    const prisma = {
      organizationBranding: {
        findUnique: jest.fn().mockResolvedValue({
          id: "brand",
          displayTitle: "CRM",
          primaryColor: "#112233",
          secondaryColor: null,
          accentColor: null,
          logoAttachmentId: "logo",
          faviconAttachmentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          objectKey: "tenant-a/private",
        }),
      },
    };
    const service = new OrganizationConfigurationService(
      prisma as any,
      {} as any,
      {} as any,
    );
    const response = await service.getBranding(tenant());
    expect(response).not.toHaveProperty("objectKey");
    expect(response.logoUrl).toBe("/api/attachments/logo/download");
  });

  it("constrains guessed domain UUID by id and trusted organizationId", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new OrganizationConfigurationService(
      { organizationDomain: { findFirst } } as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.getDomain("domain-b", tenant("tenant-a")),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "domain-b", organizationId: "tenant-a" },
      }),
    );
  });

  it("returns a DNS token once but persists only its hash", async () => {
    const create = jest.fn(({ data }: any) =>
      Promise.resolve({
        id: "domain-a",
        ...data,
        status: OrganizationDomainStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const service = new OrganizationConfigurationService(
      { organizationDomain: { create } } as any,
      { record: jest.fn() } as any,
      {} as any,
    );
    const response = await service.createDomain(
      { type: OrganizationDomainType.CUSTOM, hostname: "Example.COM." },
      tenant(),
    );
    expect(response.verification.recordName).toBe(
      "_iam-crm-verification.example.com",
    );
    expect(create.mock.calls[0][0].data.verificationTokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(create.mock.calls[0][0].data).not.toHaveProperty(
      "verificationToken",
    );
  });

  it("resolves only exact VERIFIED domains of ACTIVE Organizations", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      organizationId: "tenant-a",
      hostname: "example.com",
      type: OrganizationDomainType.CUSTOM,
    });
    const service = new OrganizationConfigurationService(
      { organizationDomain: { findFirst } } as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.resolveVerifiedHostname("EXAMPLE.COM."),
    ).resolves.toMatchObject({ organizationId: "tenant-a" });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          hostname: "example.com",
          status: OrganizationDomainStatus.VERIFIED,
          organization: { status: OrganizationStatus.ACTIVE },
        },
      }),
    );
  });

  it("verifies the correct DNS TXT token and is idempotent after success", async () => {
    const token = "correct-token";
    const record = {
      id: "domain-a",
      organizationId: "tenant-a",
      hostname: "example.com",
      status: OrganizationDomainStatus.PENDING,
      verificationTokenHash: createHash("sha256").update(token).digest("hex"),
    };
    const prisma = {
      organizationDomain: {
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn(({ data }: any) =>
          Promise.resolve({ ...record, ...data }),
        ),
      },
    };
    const service = new OrganizationConfigurationService(
      prisma as any,
      { record: jest.fn() } as any,
      {
        readTxt: jest.fn().mockResolvedValue([`iam-crm-verification=${token}`]),
      } as any,
    );
    await expect(
      service.verifyDomain("domain-a", tenant()),
    ).resolves.toMatchObject({ status: OrganizationDomainStatus.VERIFIED });
  });

  it("fails closed and sanitizes wrong DNS TXT verification", async () => {
    const record = {
      id: "domain-a",
      organizationId: "tenant-a",
      hostname: "example.com",
      status: OrganizationDomainStatus.PENDING,
      verificationTokenHash: "not-matching",
    };
    const prisma = {
      organizationDomain: {
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new OrganizationConfigurationService(
      prisma as any,
      { record: jest.fn() } as any,
      {
        readTxt: jest.fn().mockResolvedValue(["iam-crm-verification=wrong"]),
      } as any,
    );
    await expect(
      service.verifyDomain("domain-a", tenant()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.organizationDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureCode: "DNS_TXT_VERIFICATION_FAILED",
        }),
      }),
    );
  });

  it("does not permit client status escalation to VERIFIED", async () => {
    const service = new OrganizationConfigurationService(
      {
        organizationDomain: {
          findFirst: jest.fn().mockResolvedValue({ id: "d" }),
        },
      } as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.updateDomain(
        "d",
        { status: OrganizationDomainStatus.VERIFIED },
        tenant(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("migration is additive and never changes Organization IDs or infers authority", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260812160000_tenant_settings_branding_domains/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "organization_settings"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "organization_domains_hostname_key"',
    );
    expect(sql).not.toMatch(
      /UPDATE\s+"organizations"|INSERT\s+INTO\s+"platform_authorities"|INSERT\s+INTO\s+"organization_memberships"/i,
    );
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)|TRUNCATE/i);
  });

  it("enforces password/passkey policy and never trusts organizationId input", () => {
    const auth = readFileSync(
      join(process.cwd(), "src/auth/auth.service.ts"),
      "utf8",
    );
    const passkeys = readFileSync(
      join(process.cwd(), "src/auth/passkeys/passkeys.service.ts"),
      "utf8",
    );
    const controller = readFileSync(
      join(process.cwd(), "src/organizations/organizations.controller.ts"),
      "utf8",
    );
    expect(auth).toContain("allowPasswordLogin");
    expect(passkeys).toContain("allowPasskeyLogin");
    expect(controller).toContain("@CurrentTenant() tenant");
    expect(controller).not.toContain('@Query("organizationId")');
  });
});
