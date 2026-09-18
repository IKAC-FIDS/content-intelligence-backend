import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AuditActorType, AuditResult, AuditScope, AuditSource, FileAttachmentEntityType } from "@prisma/client";
import { AuditLogService } from "../src/audit-log/audit-log.service";
import { AttachmentsService } from "../src/attachments/attachments.service";
import { tenantUser } from "./helpers/tenant-user";

describe("Audit Log V2", () => {
  const context = {
    requestId: "request-1",
    organizationId: "org-1",
    actorUserId: "user-1",
    actorMembershipId: "membership-1",
    ipAddress: "2001:db8::1",
    userAgent: "test-agent",
    requestMethod: "PATCH",
    requestPath: "/api/companies/c1",
  };

  it("records trusted Tenant context with V2 fields and recursively redacts secrets", async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new AuditLogService(
      { auditLog: { create } } as any,
      { getContext: () => context } as any,
      {} as any,
    );
    const result = await service.record({
      entityType: "company",
      entityId: "c1",
      action: "company.update",
      durationMs: 12,
      metadata: { nested: { password: "secret", safe: "ok" }, token: "secret" },
    });
    expect(result).toEqual(expect.objectContaining({
      scope: AuditScope.TENANT,
      actorType: AuditActorType.USER,
      actorId: "user-1",
      actorMembershipId: "membership-1",
      source: AuditSource.API,
      result: AuditResult.SUCCESS,
      durationMs: 12,
      requestId: "request-1",
    }));
    expect((result as any).metadata).toEqual({ nested: { safe: "ok" } });
  });

  it("rejects incoherent scope and invalid duration", async () => {
    const service = new AuditLogService({} as any, { getContext: () => undefined } as any, {} as any);
    expect(() => service.recordTenantEvent({ entityType: "x", action: "x" })).toThrow(BadRequestException);
    expect(() => service.record({ entityType: "x", action: "x", durationMs: -1 })).toThrow(BadRequestException);
  });

  it("bounds oversized metadata without retaining nested secrets", async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new AuditLogService({ auditLog: { create } } as any, { getContext: () => context } as any, {} as any);
    const result = await service.record({
      entityType: "security", action: "security.payload.bounded",
      metadata: { items: Array.from({ length: 100 }, (_, index) => ({ index, safe: "x".repeat(1000), token: "never-store" })) },
    });
    expect((result as any).metadata).toEqual(expect.objectContaining({ truncated: true, originalSizeBytes: expect.any(Number) }));
    expect(JSON.stringify((result as any).metadata)).not.toContain("never-store");
  });

  it("keeps Platform audit separate and never assigns Tenant membership", async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new AuditLogService({ auditLog: { create } } as any, { getContext: () => context } as any, {} as any);
    const result = await service.recordPlatformEvent(
      { userId: "platform-1", platformAdmin: true, platformRole: "PLATFORM_ADMIN", requestId: "p-request" },
      { organizationId: "target-org", entityType: "subscription", action: "platform.subscription.updated" },
    );
    expect(result).toEqual(expect.objectContaining({ scope: AuditScope.PLATFORM, actorType: AuditActorType.PLATFORM_ADMIN, actorMembershipId: null, organizationId: "target-org" }));
  });

  it("fails closed for Tenant and Platform detail lookup", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new AuditLogService({ auditLog: { findFirst } } as any, {} as any, {} as any);
    const user = tenantUser({ userId: "u", email: "u@example.com", role: "ADMIN", organizationId: "org-a" } as any);
    await expect(service.findOne("foreign", user)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "foreign", organizationId: "org-a", scope: AuditScope.TENANT } });
    await expect(service.findOnePlatform("tenant-row")).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenLastCalledWith({ where: { id: "tenant-row", scope: AuditScope.PLATFORM } });
  });

  it("uses bounded explicit Platform search, pagination, and sort", async () => {
    const prisma = { auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, user: { findMany: jest.fn() } };
    const service = new AuditLogService(prisma as any, {} as any, {} as any);
    await service.findAllPlatform({ page: 2, limit: 10, organizationId: "00000000-0000-4000-8000-000000000001", source: AuditSource.PLATFORM, result: AuditResult.SUCCESS, sortBy: "durationMs", sortOrder: "asc" } as any);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ scope: AuditScope.PLATFORM, organizationId: "00000000-0000-4000-8000-000000000001", source: AuditSource.PLATFORM }),
      orderBy: [{ durationMs: "asc" }, { id: "desc" }], skip: 10, take: 10,
    }));
  });

  it("audits a protected download once without storage paths or file content", async () => {
    const attachment = {
      id: "attachment-1", organizationId: "org-1", entityType: FileAttachmentEntityType.OPPORTUNITY,
      entityId: "opportunity-1", objectKey: "private/object", bucket: "private", storagePath: null,
      originalFileName: "report.pdf", mimeType: "application/pdf", sizeBytes: 42,
      storageProvider: "MINIO", deletedAt: null,
    };
    const record = jest.fn().mockResolvedValue({});
    const service = new AttachmentsService(
      { fileAttachment: { findFirst: jest.fn().mockResolvedValue(attachment) }, opportunity: { findFirst: jest.fn().mockResolvedValue({ id: "opportunity-1" }) } } as any,
      { get: jest.fn() } as any,
      { record } as any,
      { getStream: jest.fn().mockResolvedValue({ pipe: jest.fn() }) } as any,
      {} as any,
    );
    const user = tenantUser({ userId: "u", email: "u@example.com", role: "ADMIN", organizationId: "org-1" } as any);
    await service.getDownloadStream("attachment-1", user);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      actorMembershipId: user.membershipId, organizationId: "org-1", action: "attachment.downloaded",
      metadata: expect.not.objectContaining({ objectKey: expect.anything(), bucket: expect.anything() }),
    }));
  });
});
