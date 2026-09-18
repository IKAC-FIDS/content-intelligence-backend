import { Prisma } from "@prisma/client";
import { PeriodComparisonService } from "../src/reports/period-comparison.service";
import { tenantUser } from "./helpers/tenant-user";

describe("PeriodComparisonService", () => {
  it("uses event dates, stable metric keys, and defined zero-baseline semantics", async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      opportunity: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: "o1",
              createdAt: new Date("2026-01-02T00:00:00Z"),
              wonAt: new Date("2026-01-03T00:00:00Z"),
              lostAt: null,
              estimatedValue: new Prisma.Decimal(100),
            },
          ]),
      },
      activity: { findMany: jest.fn().mockResolvedValue([]) },
      meeting: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      opportunityPayment: { findMany: jest.fn().mockResolvedValue([]) },
      opportunityLineItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const scopes = {
      opportunity: jest.fn().mockReturnValue({ organizationId: "org-1" }),
    };
    const service = new PeriodComparisonService(prisma as any, scopes as any);
    const result = await service.compare(
      {
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        comparisonMode: "CUSTOM",
        compareStartDate: "2025-01-01",
        compareEndDate: "2025-01-10",
      } as any,
      tenantUser({
        userId: "u",
        email: "e",
        role: "ADMIN",
        organizationId: "org-1",
      } as any),
    );
    const metrics = result.groups.flatMap((group: any) => group.metrics);
    const won = metrics.find(
      (metric: any) => metric.key === "OPPORTUNITIES_WON",
    );
    expect(won).toMatchObject({
      currentValue: 1,
      comparisonValue: 0,
      percentChange: null,
      direction: "UP",
      isImprovement: true,
    });
    const unchanged = metrics.find(
      (metric: any) => metric.key === "ACTIVITIES_RECORDED",
    );
    expect(unchanged).toMatchObject({
      percentChange: 0,
      direction: "UNCHANGED",
      isImprovement: null,
    });
    expect(scopes.opportunity).toHaveBeenCalled();
  });
});
