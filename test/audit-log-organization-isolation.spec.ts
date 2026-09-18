import { NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../src/audit-log/audit-log.service";
import { tenantUser } from "./helpers/tenant-user";
import { AuditScope } from "@prisma/client";

describe("AuditLogService organization isolation", () => {
  const user = tenantUser({
    userId: "user-1",
    email: "u@example.com",
    role: "ADMIN",
    organizationId: "org-1",
  } as any);

  it("forces the current organization on list queries and batches actor lookup", async () => {
    const row = {
      id: "a1",
      actorId: "user-1",
      entityType: "company",
      entityId: "c1",
      action: "updated",
      createdAt: new Date(),
      before: { name: "old", password: "secret" },
      after: { name: "new", token: "secret" },
      metadata: {},
      requestId: null,
      ipAddress: null,
      userAgent: null,
      requestMethod: null,
      requestPath: null,
    };
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: "user-1", fullName: "User", email: "u@example.com" },
          ]),
      },
    };
    const service = new AuditLogService(
      prisma as any,
      { getContext: () => undefined } as any,
      {} as any,
    );
    const result = await service.findAll({ page: 1, limit: 20 } as any, user);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1" }),
      }),
    );
    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: "org-1" }),
    });
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect((result.data[0] as any).before).toEqual({ name: "old" });
    expect((result.data[0] as any).after).toEqual({ name: "new" });
    expect(result.data[0].changedFields).toEqual(["name"]);
  });

  it("returns not found when a detail is outside the current organization", async () => {
    const prisma = {
      auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AuditLogService(prisma as any, {} as any, {} as any);
    await expect(service.findOne("foreign", user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", organizationId: "org-1", scope: AuditScope.TENANT },
    });
  });
});
